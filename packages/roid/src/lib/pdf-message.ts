import { PdfError } from './pdf';
import type { Message } from '../i18n';

const messages: Record<string, Message> = {
  invalid: 'This PDF could not be opened. Choose another PDF or an image.',
  'too-large': 'Choose a PDF smaller than 15 MB.',
  'too-many-pages': 'This PDF has more than 50 pages. Choose a smaller document.',
  password: 'Password-protected PDFs are not supported. Choose an unlocked copy or an image.',
  render: 'This PDF page could not be rendered. Choose another PDF or an image.',
  timeout: 'This PDF took too long to process. Choose a simpler PDF or an image.',
  cancelled: 'PDF processing was cancelled.',
  'not-ready': 'The local PDF reader is not ready. Retry the local reader.',
};
export function pdfErrorMessage(error: unknown): Message {
  return messages[error instanceof PdfError ? error.code : 'invalid'] ?? messages.invalid!;
}
