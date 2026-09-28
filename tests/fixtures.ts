/** Invented identities only; these fixtures do not come from a person's ID. */
export function withCnpChecksum(firstTwelve: string): string {
  if (!/^\d{12}$/.test(firstTwelve)) throw new Error('Expected 12 fixture digits.');
  const sum = [...'279146358279'].reduce(
    (total, weight, index) => total + Number(weight) * Number(firstTwelve[index]),
    0,
  );
  const remainder = sum % 11;
  return firstTwelve + (remainder === 10 ? '1' : String(remainder));
}

export function mrzCheckDigit(value: string): string {
  const weights = [7, 3, 1];
  const sum = [...value].reduce((total, character, index) => {
    const number = character === '<' ? 0 : /\d/.test(character)
      ? Number(character)
      : character.charCodeAt(0) - 55;
    return total + number * weights[index % 3];
  }, 0);
  return String(sum % 10);
}

export interface SyntheticMrzOptions {
  cnp?: string;
  birthDate?: string;
  sex?: string;
  expirationDate?: string;
  issuer?: string;
  nationality?: string;
  documentCode?: string;
  name?: string;
  optional1?: string;
  optional2?: string;
}

export function createSyntheticMrz(
  format: 'TD1' | 'TD2' = 'TD1',
  options: SyntheticMrzOptions = {},
): { lines: string[]; text: string; cnp: string; fullName: string } {
  const cnp = options.cnp ?? withCnpChecksum('296052640001');
  const birth = options.birthDate ?? cnp.slice(1, 7);
  const sex = options.sex ?? 'F';
  const expiry = options.expirationDate ?? '350101';
  const issuer = options.issuer ?? 'ROU';
  const nationality = options.nationality ?? 'ROU';
  const documentCode = options.documentCode ?? 'ID';
  const name = options.name ?? 'EXEMPLU<<ANA<MARIA';
  let lines: string[];

  if (format === 'TD1') {
    const document = 'AB1234567';
    const optional1 = options.optional1 ?? `${cnp}<<`;
    const optional2 = options.optional2 ?? '<'.repeat(11);
    const line1 = documentCode + issuer + document + mrzCheckDigit(document) + optional1;
    const line2WithoutComposite = birth + mrzCheckDigit(birth) + sex +
      expiry + mrzCheckDigit(expiry) + nationality + optional2;
    const composite = mrzCheckDigit(line1.slice(5) +
      line2WithoutComposite.slice(0, 7) + line2WithoutComposite.slice(8, 15) +
      line2WithoutComposite.slice(18));
    lines = [line1, line2WithoutComposite + composite, name.padEnd(30, '<')];
  } else {
    const document = 'AB123456<';
    const optional = options.optional1 ?? (cnp[0] + cnp.slice(7));
    const line2WithoutComposite = document + mrzCheckDigit(document) + nationality +
      birth + mrzCheckDigit(birth) + sex + expiry + mrzCheckDigit(expiry) + optional;
    const composite = mrzCheckDigit(line2WithoutComposite.slice(0, 10) +
      line2WithoutComposite.slice(13, 20) + line2WithoutComposite.slice(21));
    lines = [(documentCode + issuer + name).padEnd(36, '<'), line2WithoutComposite + composite];
  }

  return {
    lines,
    text: lines.join('\n'),
    cnp,
    fullName: name.replace(/<+/g, ' ').trim(),
  };
}
