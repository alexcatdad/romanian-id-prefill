import { describe, expect, it } from 'vitest';

import { createSyntheticMrz, withCnpChecksum } from '../../tests/fixtures';

import { assessMrz } from './mrz';

function replaceCharacter(value: string, index: number, replacement: string): string {
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

describe('assessMrz', () => {
  it.each(['TD1', 'TD2'] as const)('parses the verified Romanian %s CNP encoding', (format) => {
    const fixture = createSyntheticMrz(format);
    const result = assessMrz(fixture.text);
    expect(result.format).toBe(format);
    expect(result.structureValid).toBe(true);
    expect(result.mrzValid).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.fullName).toBe(fixture.fullName);
    expect(result.cnp).toBe(fixture.cnp);
    expect(result.cnpValidation?.birthDate).toBe('1996-05-26');
    expect(result.checks.filter((check) => check.label.endsWith('check digit'))).toHaveLength(4);
  });

  it('reads the old CI sex/century digit from optional data rather than inferring it', () => {
    const cnp = withCnpChecksum('500022970001');
    const fixture = createSyntheticMrz('TD2', { cnp, sex: 'M' });
    const result = assessMrz(fixture.lines);
    expect(result.valid).toBe(true);
    expect(result.cnp).toBe(cnp);
    expect(result.cnpValidation?.birthDate).toBe('2000-02-29');
  });

  it.each(['TD1', 'TD2'] as const)('supports the nationwide CNP allocation 70 in %s', (format) => {
    const cnp = withCnpChecksum('296052670001');
    const result = assessMrz(createSyntheticMrz(format, { cnp }).lines);
    expect(result.valid).toBe(true);
    expect(result.cnpValidation?.checks.county).toBe(true);
  });

  it('finds a contiguous MRZ among unrelated OCR lines and keeps only the MRZ', () => {
    const fixture = createSyntheticMrz();
    const result = assessMrz(['IDENTITY CARD', 'VISUAL FIELD LABEL', ...fixture.lines, 'OTHER TEXT']);
    expect(result.valid).toBe(true);
    expect(result.rawLines).toEqual(fixture.lines);
  });

  it('allows blank lines and outer whitespace from OCR without changing MRZ characters', () => {
    const fixture = createSyntheticMrz();
    const result = assessMrz(`\n  ${fixture.lines.join('  \r\n\r\n  ')}  \n`);
    expect(result.valid).toBe(true);
    expect(result.rawLines).toEqual(fixture.lines);
  });

  it('does not assemble an MRZ across intervening non-MRZ OCR text', () => {
    const fixture = createSyntheticMrz();
    const result = assessMrz([fixture.lines[0], 'ANOTHER OCR REGION', ...fixture.lines.slice(1)]);
    expect(result.structureValid).toBe(false);
    expect(result.fullName).toBeNull();
    expect(result.cnp).toBeNull();
  });

  it('deduplicates identical repeated OCR blocks', () => {
    const fixture = createSyntheticMrz();
    expect(assessMrz([...fixture.lines, ...fixture.lines]).valid).toBe(true);
  });

  it('rejects differing complete MRZ blocks without choosing a card', () => {
    const first = createSyntheticMrz();
    const second = createSyntheticMrz('TD1', { name: 'EXEMPLU<<ALINA<MARIA' });
    const result = assessMrz([...first.lines, ...second.lines]);
    expect(result.valid).toBe(false);
    expect(result.fullName).toBeNull();
    expect(result.cnp).toBeNull();
    expect(result.issues.some((issue) => issue.includes('More than one'))).toBe(true);
  });

  it.each(['TD1', 'TD2'] as const)('counts a damaged second %s card before deciding which MRZ to use', (format) => {
    for (const damage of ['issuer', 'sex']) {
      const first = createSyntheticMrz(format);
      const second = createSyntheticMrz(format, { name: 'EXEMPLU<<ALINA<MARIA' });
      if (damage === 'issuer') second.lines[0] = replaceCharacter(second.lines[0], 3, '0');
      else second.lines[1] = replaceCharacter(second.lines[1], format === 'TD1' ? 7 : 20, 'X');
      const result = assessMrz([...first.lines, ...second.lines]);
      expect(result.valid).toBe(false);
      expect(result.fullName).toBeNull();
      expect(result.cnp).toBeNull();
      expect(result.issues.some((issue) => issue.includes('More than one'))).toBe(true);
    }
  });

  it.each(['TD1', 'TD2'] as const)('requires Romanian issuer and nationality for %s', (format) => {
    for (const options of [{ issuer: 'UTO' }, { nationality: 'UTO' }]) {
      const result = assessMrz(createSyntheticMrz(format, options).lines);
      expect(result.structureValid).toBe(false);
      expect(result.mrzValid).toBe(false);
      expect(result.fullName).toBeNull();
      expect(result.cnp).toBeNull();
    }
  });

  it('does not accept an unrelated travel-document type', () => {
    const result = assessMrz(createSyntheticMrz('TD1', { documentCode: 'AC' }).lines);
    expect(result.valid).toBe(false);
    expect(result.structureValid).toBe(false);
  });

  it.each(['!', ' ', 'a'])('rejects unsupported name characters without prefilling, case %#', (character) => {
    const fixture = createSyntheticMrz();
    fixture.lines[2] = replaceCharacter(fixture.lines[2], 1, character);
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(false);
    expect(result.fullName).toBeNull();
    expect(result.cnp).toBeNull();
  });

  it('rejects a missing name separator', () => {
    const fixture = createSyntheticMrz();
    fixture.lines[2] = fixture.lines[2].replace('<<', '<') + '<';
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(false);
    expect(result.fullName).toBeNull();
  });

  it('rejects digit characters in names and preserves O/0 errors rather than autocorrecting', () => {
    const fixture = createSyntheticMrz();
    fixture.lines[1] = replaceCharacter(fixture.lines[1], 0, 'O');
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(false);
    expect(result.cnp).toBeNull();
    expect(result.rawLines[1][0]).toBe('O');
    expect(assessMrz(createSyntheticMrz('TD1', { name: 'EX3MPLU<<ANA' }).lines).structureValid).toBe(false);
  });

  it('rejects shortened MRZ lines and missing lines', () => {
    const fixture = createSyntheticMrz();
    expect(assessMrz(fixture.lines.slice(0, 2)).structureValid).toBe(false);
    fixture.lines[2] = fixture.lines[2].slice(0, -1);
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(false);
    expect(result.fullName).toBeNull();
    expect(result.cnp).toBeNull();
  });

  it.each([
    ['TD1', 0, 14], ['TD1', 1, 6], ['TD1', 1, 14], ['TD1', 1, 29],
    ['TD2', 1, 9], ['TD2', 1, 19], ['TD2', 1, 27], ['TD2', 1, 35],
  ] as const)('rejects each ICAO check/composite mismatch, case %#', (format, line, position) => {
    const fixture = createSyntheticMrz(format);
    const current = Number(fixture.lines[line][position]);
    fixture.lines[line] = replaceCharacter(fixture.lines[line], position, String((current + 1) % 10));
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(true);
    expect(result.mrzValid).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.checks.some((check) => check.label.endsWith('check digit') && check.status === 'fail')).toBe(true);
  });

  it('retains candidates when MRZ checks pass but the CNP checksum fails', () => {
    const fixture = createSyntheticMrz('TD1', { cnp: '2960526400013' });
    const result = assessMrz(fixture.lines);
    expect(result.structureValid).toBe(true);
    expect(result.mrzValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.cnp).toBe(fixture.cnp);
    expect(result.fullName).toBe(fixture.fullName);
    expect(result.cnpValidation?.checks.checksum).toBe(false);
  });

  it('distinguishes the official invalid-CNP specimen from a valid identity', () => {
    // Public government specimen at carteadeidentitate.gov.ro/despre/, not a user ID.
    const result = assessMrz([
      'IDROUSP123634372830703460094<<',
      '8307037F3504060ROU<<<<<<<<<<<8',
      'MANOLE<<CORINA<IOANA<<<<<<<<<<',
    ]);
    expect(result.mrzValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.cnp).toBe('2830703460094');
    expect(result.cnpValidation?.checks.checksum).toBe(false);
  });

  it('does not invent a CNP absent from the official simple identity-card MRZ', () => {
    // PRADO ROU-BO-06001, image-385251: public CIS specimen, not a user ID.
    const result = assessMrz([
      'IDROUTS10030241'.padEnd(30, '<'),
      '8307037F3505193ROU<<<<<<<<<<<8',
      'MANOLE<<CORINA<IOANA<<<<<<<<<<',
    ]);
    expect(result.structureValid).toBe(true);
    expect(result.mrzValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.fullName).toBe('MANOLE CORINA IOANA');
    expect(result.cnp).toBeNull();
    expect(result.cnpValidation).toBeNull();
    expect(result.issues.some((issue) => issue.includes('Enter the CNP'))).toBe(true);
  });

  it('requires a direct 13-digit TD1 CNP followed by two fillers', () => {
    for (const optional1 of ['296052640001<<<', '2960526400012A<', '<'.repeat(15)]) {
      const result = assessMrz(createSyntheticMrz('TD1', { optional1 }).lines);
      expect(result.mrzValid).toBe(true);
      expect(result.cnp).toBeNull();
      expect(result.valid).toBe(false);
    }
  });

  it('does not guess a TD2 CNP sex/century digit from other fields', () => {
    const result = assessMrz(createSyntheticMrz('TD2', { optional1: 'A400012' }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.cnp).toBeNull();
    expect(result.valid).toBe(false);
  });

  it('cross-checks the modern CNP birth date against the separate MRZ birth date', () => {
    const result = assessMrz(createSyntheticMrz('TD1', { birthDate: '960525' }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.cnpValidation?.valid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('birth date differs'))).toBe(true);
  });

  it('cross-checks the CNP sex against the MRZ sex', () => {
    const result = assessMrz(createSyntheticMrz('TD1', { sex: 'M' }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.cnpValidation?.valid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('sex code differs'))).toBe(true);
  });

  it('does not claim validation for an ambiguous resident CNP century', () => {
    const cnp = withCnpChecksum('896052640001');
    const result = assessMrz(createSyntheticMrz('TD1', { cnp }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.cnpValidation?.centuryAmbiguous).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.checks.find((check) => check.label === 'CNP birth date')?.status).toBe('unknown');
  });

  it.each([{ birthDate: '960631' }, { expirationDate: '350431' }, { birthDate: '96<<26' }])(
    'rejects impossible or incomplete encoded dates, case %#', (options) => {
      const result = assessMrz(createSyntheticMrz('TD1', options).lines);
      expect(result.mrzValid).toBe(false);
      expect(result.structureValid).toBe(false);
      expect(result.cnp).toBeNull();
    },
  );

  it('accepts numeric long-term expiry encoding without guessing an expiry century', () => {
    // PRADO old CI documentation notes long numeric MRZ periods for indefinite cards.
    const result = assessMrz(createSyntheticMrz('TD2', { expirationDate: '810913' }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('does not treat MRZ checks as proof that the document is currently valid', () => {
    const result = assessMrz(createSyntheticMrz('TD1', { expirationDate: '200101' }).lines);
    expect(result.mrzValid).toBe(true);
    expect(result.checks.find((check) => check.label === 'Encoded expiry date')?.detail).toContain('current document validity is not checked');
  });

  it('always flags names for human review, including a full-length possibly truncated name', () => {
    const normal = assessMrz(createSyntheticMrz().lines);
    expect(normal.warnings.some((warning) => warning.includes('not covered by check digits'))).toBe(true);
    expect(normal.checks.find((check) => check.label === 'Name confidence')?.status).toBe('unknown');
    const truncated = assessMrz(createSyntheticMrz('TD1', { name: 'EXEMPLU<<ANA<MARIA<TEODORA<ELA' }).lines);
    expect(truncated.mrzValid).toBe(true);
    expect(truncated.warnings.some((warning) => warning.includes('may be truncated'))).toBe(true);
  });

  it('handles empty/unrelated OCR without retaining it or prefilling fields', () => {
    const result = assessMrz('NO MRZ HERE');
    expect(result.valid).toBe(false);
    expect(result.format).toBeNull();
    expect(result.rawLines).toEqual([]);
    expect(result.fullName).toBeNull();
    expect(result.cnp).toBeNull();
  });
});
