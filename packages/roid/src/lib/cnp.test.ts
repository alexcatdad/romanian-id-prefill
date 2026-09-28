import { describe, expect, it } from 'vitest';

import { withCnpChecksum } from '../../tests/fixtures';

import { validateCnp } from './cnp';

const TODAY = new Date('2026-09-28T12:00:00Z');

describe('validateCnp', () => {
  it('validates an invented CNP and decodes its explicit birth century', () => {
    const result = validateCnp('2960526400012', TODAY);
    expect(result).toEqual({
      valid: true,
      checks: { length: true, sex: true, date: true, county: true, serial: true, checksum: true },
      issues: [],
      birthDate: '1996-05-26',
      centuryAmbiguous: false,
    });
  });

  it.each(['', '296052640001', '29605264000122', '2960526 400012', ' 2960526400012',
    '2960526400012\n', '29605264O0012', '２９６０５２６４０００１２'])(
    'requires exactly 13 ASCII digits without normalization, case %#', (value) => {
      const result = validateCnp(value, TODAY);
      expect(result.valid).toBe(false);
      expect(result.checks.length).toBe(false);
      expect(result.birthDate).toBeNull();
    },
  );

  it.each([
    ['1', '1900-01-01'], ['2', '1900-01-01'], ['3', '1800-01-01'],
    ['4', '1800-01-01'], ['5', '2000-01-01'], ['6', '2000-01-01'],
  ])('uses the century explicitly encoded by sex code %s', (sex, expectedDate) => {
    const result = validateCnp(withCnpChecksum(`${sex}00010140001`), TODAY);
    expect(result.valid).toBe(true);
    expect(result.birthDate).toBe(expectedDate);
  });

  it.each(['7', '8', '9'])('does not guess a century for code %s', (sex) => {
    const result = validateCnp(withCnpChecksum(`${sex}00010140001`), TODAY);
    expect(result.checks.checksum).toBe(true);
    expect(result.checks.date).toBe(true);
    expect(result.centuryAmbiguous).toBe(true);
    expect(result.birthDate).toBeNull();
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('century'))).toBe(true);
  });

  it('rejects an unsupported sex/century code despite a correct checksum', () => {
    const result = validateCnp(withCnpChecksum('096052640001'), TODAY);
    expect(result.checks.checksum).toBe(true);
    expect(result.checks.sex).toBe(false);
    expect(result.valid).toBe(false);
  });

  it.each([
    ['500022940001', true], ['504022940001', true],
    ['100022940001', false], ['300022940001', false],
    ['296063140001', false], ['296043140001', false],
    ['296132640001', false], ['296002640001', false],
    ['296050040001', false], ['296053240001', false],
  ])('checks Gregorian dates and century leap years, case %#', (digits, expected) => {
    const result = validateCnp(withCnpChecksum(digits), TODAY);
    expect(result.checks.checksum).toBe(true);
    expect(result.checks.date).toBe(expected);
    expect(result.valid).toBe(expected);
  });

  it('rejects a future birth date and accepts today', () => {
    expect(validateCnp(withCnpChecksum('526092870001'), TODAY).valid).toBe(true);
    expect(validateCnp(withCnpChecksum('526092970001'), TODAY).checks.date).toBe(false);
    expect(validateCnp(withCnpChecksum('527010140001'), TODAY).checks.date).toBe(false);
  });

  it.each(['01', '46', '47', '48', '51', '52', '70', '99'])(
    'accepts supported allocation code %s', (county) => {
      const result = validateCnp(withCnpChecksum(`2960526${county}001`), TODAY);
      expect(result.checks.county).toBe(true);
      expect(result.valid).toBe(true);
    },
  );

  it.each(['00', '49', '50', '53', '69', '71'])(
    'rejects an unsupported allocation code %s', (county) => {
      const result = validateCnp(withCnpChecksum(`2960526${county}001`), TODAY);
      expect(result.checks.county).toBe(false);
      expect(result.valid).toBe(false);
    },
  );

  it('rejects serial 000 even when the checksum matches', () => {
    const result = validateCnp(withCnpChecksum('296052640000'), TODAY);
    expect(result.checks.checksum).toBe(true);
    expect(result.checks.serial).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('uses 1 when the checksum remainder is 10', () => {
    expect(withCnpChecksum('296052641001')).toBe('2960526410011');
    expect(validateCnp('2960526410011', TODAY).valid).toBe(true);
    expect(validateCnp('2960526410010', TODAY).checks.checksum).toBe(false);
  });

  it('does not accept a checksum mismatch or expose the input in issue messages', () => {
    const value = '2960526400013';
    const result = validateCnp(value, TODAY);
    expect(result.checks.checksum).toBe(false);
    expect(result.issues.join(' ')).not.toContain(value);
  });
});
