import { parse, type ParseResult } from 'mrz';

import { validateCnp, type CnpValidation } from './cnp';

export interface MrzCheck {
  label: string;
  status: 'pass' | 'fail' | 'unknown';
  detail?: string;
}

export interface MrzAssessment {
  format: 'TD1' | 'TD2' | null;
  structureValid: boolean;
  mrzValid: boolean;
  valid: boolean;
  checks: MrzCheck[];
  surname: string | null;
  givenNames: string | null;
  fullName: string | null;
  cnp: string | null;
  cnpValidation: CnpValidation | null;
  /** Document fields are exposed only after the complete MRZ passes validation. */
  documentSeries: string | null;
  /** Numeric portion, excluding the two-letter series and MRZ filler. */
  documentNumber: string | null;
  /** Encoded YYMMDD; no century or current document validity is inferred. */
  mrzExpirationDate: string | null;
  issuingCountry: string | null;
  nationality: string | null;
  mrzBirthDate: string | null;
  mrzSex: string | null;
  rawLines: string[];
  issues: string[];
  warnings: string[];
}

type Format = NonNullable<MrzAssessment['format']>;

const CHECK_DIGITS = new Set([
  'documentNumberCheckDigit',
  'birthDateCheckDigit',
  'expirationDateCheckDigit',
  'compositeCheckDigit',
]);

function emptyAssessment(
  issues: string[],
  format: MrzAssessment['format'] = null,
  rawLines: string[] = [],
): MrzAssessment {
  return {
    format,
    structureValid: false,
    mrzValid: false,
    valid: false,
    checks: [{ label: 'MRZ structure', status: 'fail' }],
    surname: null,
    givenNames: null,
    fullName: null,
    cnp: null,
    cnpValidation: null,
    documentSeries: null,
    documentNumber: null,
    mrzExpirationDate: null,
    issuingCountry: null,
    nationality: null,
    mrzBirthDate: null,
    mrzSex: null,
    rawLines,
    issues,
    warnings: [],
  };
}

function hasDimensions(lines: string[], format: Format): boolean {
  const [count, width] = format === 'TD1' ? [3, 30] : [2, 36];
  return lines.length === count && lines.every((line) => line.length === width);
}

function isCalendarYyMmDd(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false;
  const yy = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  // The MRZ itself encodes no century. The CNP supplies it for a known CNP code.
  // Numeric long-term expiry dates must not be rejected by an age/expiry pivot.
  return [1800, 1900, 2000, 2100].some((century) => {
    const year = century + yy;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  });
}

function binaryCheck(label: string, pass: boolean, detail?: string): MrzCheck {
  return { label, status: pass ? 'pass' : 'fail', ...(detail ? { detail } : {}) };
}

function assessCandidate(lines: string[], format: Format): MrzAssessment {
  const dimensions = hasDimensions(lines, format);
  const characters = lines.every((line) => /^[A-Z0-9<]+$/.test(line));
  if (!dimensions || !characters) {
    return emptyAssessment([
      dimensions
        ? 'The MRZ contains unsupported characters. Retake the photo; no characters were substituted.'
        : `A complete ${format} MRZ requires ${format === 'TD1' ? 'three lines of 30' : 'two lines of 36'} characters.`,
    ], format, lines);
  }

  const code = lines[0].slice(0, 2);
  const issuer = lines[0].slice(2, 5);
  const nationality = format === 'TD1' ? lines[1].slice(15, 18) : lines[1].slice(10, 13);
  const document = format === 'TD1' ? lines[0].slice(5, 14) : lines[1].slice(0, 9);
  const documentCheck = format === 'TD1' ? lines[0][14] : lines[1][9];
  const birth = format === 'TD1' ? lines[1].slice(0, 6) : lines[1].slice(13, 19);
  const expiry = format === 'TD1' ? lines[1].slice(8, 14) : lines[1].slice(21, 27);
  const sex = format === 'TD1' ? lines[1][7] : lines[1][20];
  const name = format === 'TD1' ? lines[2] : lines[0].slice(5);

  const supportedCard = code === 'ID';
  const romanianIssuer = issuer === 'ROU';
  const romanianNationality = nationality === 'ROU';
  const supportedDocument = /^\d$/.test(documentCheck) &&
    (format === 'TD1' ? /^[A-Z]{2}\d{7}$/.test(document) : /^[A-Z]{2}\d{6}<$/.test(document));
  const namesValid = /^[A-Z]+(?:<[A-Z]+)*<<[A-Z]+(?:<[A-Z]+)*<*$/.test(name);
  const birthValid = isCalendarYyMmDd(birth);
  const expiryValid = isCalendarYyMmDd(expiry);

  const checks: MrzCheck[] = [
    binaryCheck('MRZ structure', true, format === 'TD1' ? 'Three lines of 30 characters.' : 'Two lines of 36 characters.'),
    binaryCheck('Supported identity-card type', supportedCard, 'This MVP supports the verified ID card layouts.'),
    binaryCheck('Romanian issuer', romanianIssuer),
    binaryCheck('Romanian nationality', romanianNationality),
    binaryCheck('Document-number layout', supportedDocument),
    binaryCheck('Encoded birth date', birthValid),
    binaryCheck('Encoded expiry date', expiryValid, 'Calendar structure only; current document validity is not checked.'),
  ];
  const issues: string[] = [];
  if (!supportedCard) issues.push('This document type is not a supported Romanian identity card.');
  if (!romanianIssuer || !romanianNationality) issues.push('Both issuer and nationality must be ROU.');
  if (!supportedDocument) issues.push('The document number uses an unsupported layout.');
  if (!namesValid) issues.push('The MRZ name field is incomplete or malformed.');
  if (!birthValid) issues.push('The MRZ birth date is incomplete or is not a calendar date.');
  if (!expiryValid) issues.push('The MRZ expiry date is incomplete or is not a calendar date.');

  let parsed: ParseResult;
  try {
    // Do not correct O/0, I/1, missing fillers, or check digits to force a match.
    parsed = parse(lines, { autocorrect: false });
  } catch {
    return {
      ...emptyAssessment(['The MRZ could not be parsed. Retake the photo.'], format, lines),
      checks,
    };
  }

  const fieldSyntaxValid = parsed.format === format && parsed.details.every((field) =>
    field.field !== null && CHECK_DIGITS.has(field.field) ? true : field.valid,
  );
  const structureValid = supportedCard && romanianIssuer && romanianNationality &&
    supportedDocument && namesValid && birthValid && expiryValid && fieldSyntaxValid;

  for (const field of parsed.details) {
    if (field.field && CHECK_DIGITS.has(field.field)) {
      checks.push(binaryCheck(field.label, field.valid));
      if (!field.valid) issues.push(`${field.label} does not match. Retake the photo.`);
    }
  }

  if (!fieldSyntaxValid) issues.push('One or more MRZ fields have invalid syntax.');
  const mrzValid = structureValid && parsed.valid;
  if (!structureValid) {
    return {
      ...emptyAssessment([...new Set(issues)], format, lines),
      checks: checks.map((check) => check.label === 'MRZ structure'
        ? { ...check, status: 'fail', detail: 'The full supported Romanian MRZ structure was not validated.' }
        : check),
    };
  }

  const [surnameRaw, givenRaw] = name.replace(/<+$/, '').split('<<');
  const surname = surnameRaw.replace(/</g, ' ');
  const givenNames = givenRaw.replace(/</g, ' ');
  const fullName = `${surname} ${givenNames}`;
  const warnings = [
    'MRZ names are not covered by check digits and omit diacritics. Compare the complete name with your card.',
  ];
  checks.push({
    label: 'Name confidence',
    status: 'unknown',
    detail: 'An OCR reading needs your review; check digits do not validate the name.',
  });
  if (/[A-Z]$/.test(name)) {
    warnings.push('The name fills the MRZ field and may be truncated. Enter the complete name from your card.');
  }

  let cnp: string | null = null;
  if (format === 'TD1') {
    const optional = lines[0].slice(15, 30);
    if (/^[1-9]\d{12}<<$/.test(optional)) cnp = optional.slice(0, 13);
  } else {
    const optional = lines[1].slice(28, 35);
    // HG 295/2021 Annex 2, 5(c): the old CI MRZ omits the six CNP DOB digits.
    // Read S from the optional field, rather than guessing a sex/century digit.
    if (/^[1-9]\d{6}$/.test(optional)) cnp = optional[0] + birth + optional.slice(1);
  }

  checks.push(binaryCheck('CNP encoding', cnp !== null));
  const cnpValidation = cnp ? validateCnp(cnp) : null;
  let birthMatches = false;
  let sexMatches = false;
  if (!cnp || !cnpValidation) {
    issues.push('The optional MRZ data does not contain a CNP in a supported encoding. Enter the CNP from your card.');
  } else {
    const cnpLabels: Record<keyof CnpValidation['checks'], string> = {
      length: 'CNP length',
      sex: 'CNP sex/century code',
      date: 'CNP birth date',
      county: 'CNP allocation code',
      serial: 'CNP serial',
      checksum: 'CNP checksum',
    };
    for (const [key, value] of Object.entries(cnpValidation.checks)) {
      checks.push(key === 'date' && cnpValidation.centuryAmbiguous
        ? { label: cnpLabels.date, status: 'unknown', detail: 'The CNP does not encode a century.' }
        : binaryCheck(cnpLabels[key as keyof CnpValidation['checks']], value));
    }
    issues.push(...cnpValidation.issues);
    birthMatches = cnp.slice(1, 7) === birth;
    checks.push(binaryCheck('CNP / MRZ birth-date agreement', birthMatches));
    if (!birthMatches) issues.push('The CNP birth date differs from the MRZ birth date.');

    const expectedSex = /^[1357]/.test(cnp) ? 'M' : /^[2468]/.test(cnp) ? 'F' : null;
    sexMatches = expectedSex !== null && expectedSex === sex;
    if (expectedSex === null || sex === '<') {
      checks.push({ label: 'CNP / MRZ sex agreement', status: 'unknown' });
      issues.push('CNP / MRZ sex agreement cannot be verified.');
    } else {
      checks.push(binaryCheck('CNP / MRZ sex agreement', sexMatches));
      if (!sexMatches) issues.push('The CNP sex code differs from the MRZ sex field.');
    }
  }

  return {
    format,
    structureValid,
    mrzValid,
    valid: mrzValid && cnpValidation?.valid === true && birthMatches && sexMatches,
    checks,
    surname,
    givenNames,
    fullName,
    cnp,
    cnpValidation,
    documentSeries: mrzValid ? document.slice(0, 2) : null,
    documentNumber: mrzValid ? document.slice(2).replace(/<+$/, '') : null,
    mrzExpirationDate: mrzValid ? expiry : null,
    issuingCountry: mrzValid ? issuer : null,
    nationality: mrzValid ? nationality : null,
    mrzBirthDate: birth,
    mrzSex: sex,
    rawLines: lines,
    issues: [...new Set(issues)],
    warnings,
  };
}

/** Extract one contiguous MRZ block; keep unrelated OCR text out of the result. */
export function assessMrz(text: string | string[]): MrzAssessment {
  const source = (Array.isArray(text) ? text : [text])
    .flatMap((line) => line.split(/[\r\n]+/))
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = new Map<string, { lines: string[]; format: Format }>();

  for (let index = 0; index < source.length; index += 1) {
    const first = source[index];
    // Count plausible complete blocks before validating their country/sex
    // fields. A damaged second card must not make us silently select the first.
    if (!/^[ICA1][A-Z0-9<]{4}/.test(first)) continue;
    const format = first.length === 30 ? 'TD1' : first.length === 36 ? 'TD2' : null;
    if (!format) continue;
    const lines = source.slice(index, index + (format === 'TD1' ? 3 : 2));
    if (!hasDimensions(lines, format)) continue;
    candidates.set(lines.join('\n'), { lines, format });
    // The rows within a complete block cannot start another card, even when
    // its name starts with I/C/A. Repeated identical blocks remain deduplicated.
    index += lines.length - 1;
  }

  if (candidates.size > 1) {
    return emptyAssessment(['More than one different complete MRZ was found. Process one card at a time.']);
  }
  const candidate = [...candidates.values()][0];
  if (candidate) return assessCandidate(candidate.lines, candidate.format);

  // Direct malformed input still gets a concrete format/structure error, never
  // a partial name or CNP. Do not assemble lines across intervening OCR text.
  if (hasDimensions(source, 'TD1')) return assessCandidate(source, 'TD1');
  if (hasDimensions(source, 'TD2')) return assessCandidate(source, 'TD2');
  return emptyAssessment(['No complete supported MRZ could be read. Keep all MRZ lines visible and retake the photo.']);
}
