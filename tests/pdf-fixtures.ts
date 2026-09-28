import { createSyntheticMrz } from './fixtures';

/** Tiny PDFs containing invented text only. No external files, fonts, or real IDs. */
export function createSyntheticPdf(options: { pages?: number; lines?: string[]; pageLines?: string[][]; encrypted?: boolean } = {}): Buffer {
  const count = options.pages ?? 2;
  const lines = options.lines ?? createSyntheticMrz().lines;
  const objects: Buffer[] = [];
  const add = (value: string) => objects.push(Buffer.from(value, 'ascii'));
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = Array.from({ length: count }, (_, index) => 4 + index * 2);
  add(`<< /Type /Pages /Count ${count} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>');
  for (let index = 0; index < count; index++) {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 500] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`);
    // Put the MRZ inside the same bottom strip used by a full-card photo.
    const commands = (options.pageLines?.[index] ?? lines).map((line, row) => `BT /F1 24 Tf 1 0 0 1 24 ${125 - row * 42} Tm (${line.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n');
    add(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`);
  }
  let encryptionId: number | undefined;
  if (options.encrypted) {
    encryptionId = objects.length + 1;
    add('<< /Filter /Standard /V 1 /R 2 /Length 40 /O <0000000000000000000000000000000000000000000000000000000000000000> /U <0000000000000000000000000000000000000000000000000000000000000000> /P -4 >>');
  }
  const chunks = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets = [0];
  let position = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(position);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    chunks.push(chunk); position += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryptionId ? ` /Encrypt ${encryptionId} 0 R /ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]` : ''} >>\nstartxref\n${position}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'ascii'));
  return Buffer.concat(chunks);
}

/** A scanned-page equivalent, wrapping caller-generated synthetic JPEG bytes. */
export function createScannedPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const drawing = 'q 900 0 0 500 0 0 cm /Scan Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 500] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let position = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(position);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    chunks.push(chunk); position += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
