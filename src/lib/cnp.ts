export interface CnpValidation {
  valid: boolean;
  checks: {
    length: boolean;
    sex: boolean;
    date: boolean;
    county: boolean;
    serial: boolean;
    checksum: boolean;
  };
  issues: string[];
  birthDate: string | null;
  centuryAmbiguous: boolean;
}

const CONTROL_WEIGHTS = '279146358279';
const CENTURY: Record<string, number> = {
  '1': 1900,
  '2': 1900,
  '3': 1800,
  '4': 1800,
  '5': 2000,
  '6': 2000,
};

function calendarDate(year: number, month: number, day: number): number | null {
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? timestamp
    : null;
}

/** Local syntax/checksum validation, never a registry or identity verification. */
export function validateCnp(value: string, now: Date = new Date()): CnpValidation {
  const checks: CnpValidation['checks'] = {
    length: /^\d{13}$/.test(value),
    sex: false,
    date: false,
    county: false,
    serial: false,
    checksum: false,
  };
  if (!checks.length) {
    return {
      valid: false,
      checks,
      issues: ['Enter exactly 13 digits, without spaces or other characters.'],
      birthDate: null,
      centuryAmbiguous: false,
    };
  }

  const sexCode = value[0];
  checks.sex = /^[1-9]$/.test(sexCode);
  const centuryAmbiguous = /^[789]$/.test(sexCode);
  const yy = Number(value.slice(1, 3));
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let birthDate: string | null = null;

  const century = CENTURY[sexCode];
  if (century !== undefined) {
    const year = century + yy;
    const timestamp = calendarDate(year, month, day);
    checks.date = timestamp !== null && timestamp <= today;
    if (checks.date) {
      birthDate = `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
    }
  } else if (centuryAmbiguous) {
    // Resident/foreign codes do not encode a century. Calendar plausibility can
    // be checked, but the full birth date must never be guessed from age/today.
    checks.date = [1800, 1900, 2000].some((base) => {
      const timestamp = calendarDate(base + yy, month, day);
      return timestamp !== null && timestamp <= today;
    });
  }

  const county = Number(value.slice(7, 9));
  // 47/48 are historic Bucharest sectors; 70 is the current nationwide SIIEASC
  // sequence; 99 is a foreign-person allocation, not a Romanian county.
  checks.county =
    (county >= 1 && county <= 48) || [51, 52, 70, 99].includes(county);
  const serial = Number(value.slice(9, 12));
  checks.serial = serial >= 1 && serial <= 999;

  const sum = [...CONTROL_WEIGHTS].reduce(
    (total, weight, index) => total + Number(weight) * Number(value[index]),
    0,
  );
  const remainder = sum % 11;
  checks.checksum = Number(value[12]) === (remainder === 10 ? 1 : remainder);

  const issues: string[] = [];
  if (!checks.sex) issues.push('The first CNP digit is not a supported sex/century code.');
  if (!checks.date) issues.push('The encoded birth date is invalid or in the future.');
  if (!checks.county) issues.push('The CNP allocation code is not recognised.');
  if (!checks.serial) issues.push('The CNP serial must be between 001 and 999.');
  if (!checks.checksum) issues.push('The CNP checksum does not match.');
  if (centuryAmbiguous) {
    issues.push('This CNP code does not encode a birth century; the full birth date cannot be validated without another source.');
  }

  return {
    valid: Object.values(checks).every(Boolean) && !centuryAmbiguous,
    checks,
    issues,
    birthDate,
    centuryAmbiguous,
  };
}
