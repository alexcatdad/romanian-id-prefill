/** Unverified printed-side candidates. Never infer a domicile from birthplace,
 * issuer, CNP allocation, or a missing label. Every value requires review. */
export interface PrintedAddress {
  raw: string;
  county?: string;
  locality?: string;
  village?: string;
  sector?: string;
  street?: string;
  number?: string;
  block?: string;
  staircase?: string;
  floor?: string;
  apartment?: string;
}
export interface PrintedIdFields {
  fullName?: string;
  cnp?: string;
  documentSeries?: string;
  documentNumber?: string;
  address?: PrintedAddress;
  cardType: 'CI' | 'CEI' | 'CIS' | 'unknown';
}
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const clean = (value: string) => value.replace(/^[\s:./-]+|[\s:./-]+$/g, '').replace(/\s+/g, ' ');
const boundary = /^(?:CNP\b|COD NUMERIC|NUME\b|PRENUME\b|CETATEN|NATIONAL|SEX\b|DOMICILI|ADRESA\b|ADDRESS\b|LOC(?:UL)? NASTER|PLACE OF BIRTH|EMIS|ELIBER|ISSU|VALABIL|VALID|DATA\b|DATE\b|SERIA\b|SERIES\b|NR\b|CARTE\b|IDENTITY\b|IDROU|I<ROU)/;
const translatedLabel = /^(?:NOM|SURNAME|NAME|PRENOM|PRENOMS|GIVEN NAMES?|FORENAMES?|DOMICILE|ADDRESS|ADRESSE)(?:\s*\/\s*(?:NOM|SURNAME|NAME|PRENOM|PRENOMS|GIVEN NAMES?|FORENAMES?|DOMICILE|ADDRESS|ADRESSE))*$/;
function labelValue(lines: string[], label: RegExp): string | undefined {
  const candidates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = label.exec(fold(lines[i]));
    if (!match) continue;
    const suffix = lines[i].slice(match[0].length);
    // Slash-separated captions must be complete known labels. A damaged
    // English/French caption must never become the holder's surname.
    if (/^\s*\//.test(suffix) && !translatedLabel.test(fold(clean(suffix)))) continue;
    let remainder = clean(suffix);
    // Romanian cards also print French/English captions after a slash.
    remainder = remainder.replace(/^(?:(?:NOM|SURNAME|NAME|PRENOMS?|GIVEN NAMES?|FORENAMES?)\s*[/ :.-]*\s*)+/i, '');
    if (!remainder && i + 1 < lines.length) {
      let next = i + 1;
      while (next < lines.length && translatedLabel.test(fold(clean(lines[next])))) next++;
      if (next < lines.length && !boundary.test(fold(lines[next]))) remainder = clean(lines[next]);
    }
    if (remainder && !boundary.test(fold(remainder))) candidates.push(remainder);
  }
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : undefined;
}
export function parsePrintedId(text: string): PrintedIdFields {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const normalized = fold(lines.join('\n'));
  const cardType = /CARTE\s+ELECTRONICA\s+DE\s+IDENTITATE/.test(normalized) ? 'CEI'
    : /CARTE\s+DE\s+IDENTITATE\s+SIMPLA/.test(normalized) ? 'CIS' : 'unknown';
  const fields: PrintedIdFields = { cardType };
  const surname = labelValue(lines, /^(?:NUME(?:LE)?|SURNAME)\b\s*/);
  const given = labelValue(lines, /^(?:PRENUME(?:LE)?|GIVEN NAMES?)\b\s*/);
  const isName = (value: string) => /^[\p{L}][\p{L} '\-]{1,90}$/u.test(value) && !translatedLabel.test(fold(value));
  if (surname && given && isName(surname) && isName(given)) fields.fullName = `${surname} ${given}`;
  const cnpMatches = [...normalized.matchAll(/\b(?:CNP|COD NUMERIC PERSONAL)\s*[:.-]?\s*(\d{13})(?!\d)/g)].map(match => match[1]);
  if (new Set(cnpMatches).size === 1) fields.cnp = cnpMatches[0];
  const docMatches = [...normalized.matchAll(/\b(?:SERIA|SERIES)\s*[:.-]?\s*([A-Z]{2})\s+(?:NR\.?|NUMAR(?:UL)?|NUMBER)\s*[:.-]?\s*(\d{6,7})(?!\d)/g)];
  if (docMatches.length === 1) {
    fields.documentSeries = docMatches[0][1]; fields.documentNumber = docMatches[0][2];
  } else if (!docMatches.length) {
    const numbers = [...normalized.matchAll(/\b(?:NUMAR(?:UL)? DOCUMENT(?:ULUI)?|DOCUMENT (?:NO\.?|NUMBER))\s*[:.-]?\s*([A-Z]{2}\d{7}|\d{9})(?![A-Z0-9])/g)].map(match => match[1]);
    if (new Set(numbers).size === 1) {
      const combined = /^([A-Z]{2})(\d{7})$/.exec(numbers[0]);
      if (combined) { fields.documentSeries = combined[1]; fields.documentNumber = combined[2]; }
      else fields.documentNumber = numbers[0];
    }
  }
  const addresses: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const label = /^(?:DOMICILIU(?:L)?|ADRESA(?: DE DOMICILIU)?|ADDRESS)\b\s*/.exec(fold(lines[i]));
    if (!label) continue;
    const section = [clean(lines[i].slice(label[0].length)).replace(/^(?:(?:DOMICILE|ADDRESS|ADRESSE)\s*[/ :.-]*\s*)+/i, '')];
    for (let next = i + 1; next < lines.length && next <= i + 5; next++) {
      if (boundary.test(fold(lines[next]))) break;
      if (!translatedLabel.test(fold(lines[next]))) section.push(lines[next]);
    }
    const raw = clean(section.join(' '));
    if (raw) addresses.push(raw);
  }
  if (addresses.length === 1) fields.address = parseAddress(addresses[0]);
  return fields;
}
function parseAddress(raw: string): PrintedAddress {
  const result: PrintedAddress = { raw };
  const markers = /\b(JUD(?:ET(?:UL)?)?|MUN(?:ICIPIUL)?|ORAS(?:UL)?|COM(?:UNA)?|SAT(?:UL)?|SECT(?:OR(?:UL)?)?|LOC(?:ALITATEA)?|STR(?:ADA)?|BD(?:UL)?|BULEVARD(?:UL)?|SOS(?:EAUA)?|ALEEA|NR|NUMAR(?:UL)?|BL(?:OC)?|SC(?:ARA)?|ET(?:AJ)?|AP(?:ARTAMENT)?)\b\.?\s*:?\s*/g;
  const matches = [...fold(raw).matchAll(markers)];
  const values = new Map<keyof PrintedAddress, string[]>();
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]; const label = match[1];
    const key: keyof PrintedAddress = /^JUD/.test(label) ? 'county' : /^(MUN|ORAS|COM|LOC)/.test(label) ? 'locality' : /^SAT/.test(label) ? 'village' : /^SECT/.test(label) ? 'sector'
      : /^(STR|BD|BULEVARD|SOS|ALEEA)/.test(label) ? 'street' : /^(NR|NUMAR)/.test(label) ? 'number'
        : /^BL/.test(label) ? 'block' : /^SC/.test(label) ? 'staircase' : /^ET/.test(label) ? 'floor' : 'apartment';
    const value = clean(raw.slice(match.index! + match[0].length, matches[i + 1]?.index ?? raw.length)).replace(/[,;]+$/, '').trim();
    if (value) values.set(key, [...(values.get(key) ?? []), value]);
  }
  // Repeated locality, street or number labels are ambiguous; retain
  // the address for review but do not choose an arbitrary component.
  for (const [key, candidates] of values) {
    if (candidates.length !== 1) continue;
    const value = candidates[0];
    // Unrecognised OCR labels can leak into a preceding numeric component.
    // Keep the complete address for review, never repair or split that text.
    const compact = /^[\p{L}\d]{1,8}(?:[/-][\p{L}\d]{1,8})?$/u;
    if (key === 'number' && !/^(?:\d{1,6}[A-Z]?(?:[/-]\d{1,6}[A-Z]?)?|F\.?N\.?)$/i.test(value)) continue;
    if (['block', 'staircase', 'apartment', 'sector'].includes(key) && !compact.test(value)) continue;
    if (key === 'floor' && !/^(?:-?\d{1,3}|P|M|D|S|PARTER|DEMISOL|MANSARDA|SUBSOL)$/i.test(fold(value))) continue;
    result[key] = value;
  }
  return result;
}
