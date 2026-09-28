import { describe, expect, it } from 'vitest';
import { parsePrintedId } from './printed-id';
describe('printed Romanian ID candidates', () => {
  it('reads labelled names, document and domicile without losing diacritics', () => {
    const result = parsePrintedId(`CARTE DE IDENTITATE
SERIA RX NR. 123456
CNP 1900101400010
Nume / Nom / Surname
ȘERBĂNESCU
Prenume / Prenom / Given names
ȘTEFAN
Loc naștere
Jud. IAȘI Mun. IAȘI
Domiciliu / Domicile / Address
Jud. CLUJ Mun. CLUJ-NAPOCA
Str. ȘCOLII nr. 10 bl. B sc. 2 et. 3 ap. 4
Emisă de SPCLEP CLUJ
Valabilitate 01.01.2020 01.01.2030`);
    expect(result).toEqual({ cardType: 'unknown', fullName: 'ȘERBĂNESCU ȘTEFAN', cnp: '1900101400010', documentSeries: 'RX', documentNumber: '123456', address: { raw: 'Jud. CLUJ Mun. CLUJ-NAPOCA Str. ȘCOLII nr. 10 bl. B sc. 2 et. 3 ap. 4', county: 'CLUJ', locality: 'CLUJ-NAPOCA', street: 'ȘCOLII', number: '10', block: 'B', staircase: '2', floor: '3', apartment: '4' } });
  });
  it('does not use birthplace or issuer as domicile', () => {
    expect(parsePrintedId('CARTE ELECTRONICĂ DE IDENTITATE\nLoc naștere\nJud. CLUJ Mun. CLUJ\nEmis de SPCLEP CLUJ')).toEqual({ cardType: 'CEI' });
  });
  it('keeps explicit commune and village separate without inventing missing components', () => {
    expect(parsePrintedId('Domiciliu\nJud. IAȘI Com. MIROSLAVA Sat. VALEA ADÂNCĂ Nr. 2').address).toEqual({ raw: 'Jud. IAȘI Com. MIROSLAVA Sat. VALEA ADÂNCĂ Nr. 2', county: 'IAȘI', locality: 'MIROSLAVA', village: 'VALEA ADÂNCĂ', number: '2' });
  });
  it('rejects conflicting labels and preserves numeric errors for validation, never repairs characters', () => {
    const result = parsePrintedId('Nume POPESCU\nNume IONESCU\nPrenume ION\nCNP 19O0101400010\nSERIA RX NR. 12345O');
    expect(result).toEqual({ cardType: 'unknown' });
  });
  it('accepts inline Romanian and English names', () => {
    expect(parsePrintedId('Surname: POPESCU\nGiven names: ION ANDREI').fullName).toBe('POPESCU ION ANDREI');
  });
  it('never treats another label or caption as a name', () => {
    expect(parsePrintedId('Nume / Surname\nPrenume / Given names\nSex M').fullName).toBeUndefined();
  });
  it('recognizes CIS and modern labelled document numbers', () => {
    expect(parsePrintedId('CARTE DE IDENTITATE SIMPLĂ\nDocument number: AB1234567')).toEqual({ cardType: 'CIS', documentSeries: 'AB', documentNumber: '1234567' });
  });
  it('leaves unlabelled numbers and names unassigned', () => {
    expect(parsePrintedId('POPESCU ION\n1900101400010\nRX123456')).toEqual({ cardType: 'unknown' });
  });
  it('does not silently choose among two domicile sections', () => {
    expect(parsePrintedId('Domiciliu: Str. A nr. 1\nDomiciliu: Str. B nr. 2').address).toBeUndefined();
  });
});

it('reads Bucharest sector and seven-digit numbered document', () => {
  expect(parsePrintedId('SERIA SP NR 1234567\nDomiciliu Mun. BUCUREȘTI Sect. 3 Str. ȘCOLII Nr. 2')).toEqual({cardType: 'unknown', documentSeries:'SP', documentNumber:'1234567', address:{raw:'Mun. BUCUREȘTI Sect. 3 Str. ȘCOLII Nr. 2', locality:'BUCUREȘTI', sector:'3', street:'ȘCOLII', number:'2'}});
});

it('does not identify a card generation from the generic title', () => {
  expect(parsePrintedId('CARTE DE IDENTITATE\nDocument number: SP1234567')).toEqual({cardType:'unknown', documentSeries:'SP', documentNumber:'1234567'});
});
it('rejects partial or damaged name captions instead of treating them as names', () => {
  for (const caption of ['Nume / Nom / Surn', 'Nume / Surn@me', 'Nume / Nom / Surname :']) {
    expect(parsePrintedId(caption + '\nPrenume ION').fullName).toBeUndefined();
  }
});

it('keeps OCR label leakage out of structured numeric address components', () => {
  const address = parsePrintedId('Domiciliu Str. TEST Nr. 12 BI. B Sc. 2 Et. P Ap. 4').address;
  expect(address?.raw).toContain('12 BI. B');
  expect(address?.number).toBeUndefined();
  expect(address?.staircase).toBe('2');
  expect(address?.floor).toBe('P');
});
it.each(['12A', '12-14', '12/1', 'F.N.'])('preserves explicit supported house number %s', number => {
  expect(parsePrintedId('Domiciliu Str. TEST Nr. ' + number).address?.number).toBe(number.replace(/\.$/, ''));
});
