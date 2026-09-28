import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import type { LocalPdfReader } from '../lib/pdf';
import { pdfErrorMessage } from '../lib/pdf-message';
import { clearCanvas } from '../lib/image';

export function PdfPagePicker({ reader, pageCount, onSelect, onCancel }: {
  reader: LocalPdfReader; pageCount: number;
  onSelect: (canvas: HTMLCanvasElement) => void; onCancel: () => void;
}) {
  const { t, message, language } = useLanguage();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [renderedPage, setRenderedPage] = useState(0);
  const [error, setError] = useState('');
  const rendered = useRef<HTMLCanvasElement | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const display = preview.current;
    if (rendered.current) clearCanvas(rendered.current);
    rendered.current = null;
    if (display) clearCanvas(display);
    setBusy(true); setError('');
    void reader.render(page).then((canvas) => {
      if (!active || !display) { clearCanvas(canvas); return; }
      rendered.current = canvas;
      display.width = canvas.width; display.height = canvas.height;
      const context = display.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(canvas, 0, 0);
      setRenderedPage(page);
    }).catch((failure) => {
      if (active) {
        if (rendered.current) clearCanvas(rendered.current);
        rendered.current = null;
        if (display) clearCanvas(display);
        setError(pdfErrorMessage(failure));
      }
    }).finally(() => { if (active) setBusy(false); });
    return () => {
      active = false;
      if (rendered.current) clearCanvas(rendered.current);
      rendered.current = null;
      if (display) clearCanvas(display);
    };
  }, [reader, page]);
  const pageReady = !busy && !error && renderedPage === page;
  return <section className="pdf-picker" aria-label={t('Choose a PDF page')}>
    <h2>{t('Choose a PDF page')}</h2>
    <p className="panel-description">{t('Choose the page showing your ID. We will guide you through reading it next.')}</p>
    <p className="pdf-page-count" aria-live="polite">{language === 'ro' ? `Pagina ${page} din ${pageCount}` : `Page ${page} of ${pageCount}`}</p>
    {busy ? <p role="status">{t('Rendering the page on this device…')}</p> : null}
    <canvas ref={preview} className="pdf-page-preview" role="img" aria-label={t('Preview of the selected PDF page')} hidden={busy || Boolean(error)} />
    {error ? <p className="field-error" role="alert">{message(error)}</p> : null}
    <div className="pdf-page-navigation">
      <button className="button button-secondary" disabled={!pageReady || page === 1} onClick={() => setPage(page - 1)}>{t('Previous page')}</button>
      <button className="button button-secondary" disabled={!pageReady || page === pageCount} onClick={() => setPage(page + 1)}>{t('Next page')}</button>
    </div>
    <p className="field-hint">{t('The PDF stays in memory only until you select a page or discard it. Links and scripts are not opened.')}</p>
    <div className="image-editor-actions">
      <button className="button button-secondary" onClick={onCancel}>{t('Discard PDF')}</button>
      <button className="button button-primary" disabled={!pageReady} onClick={() => {
        const canvas = rendered.current;
        if (!pageReady || !canvas) return;
        rendered.current = null;
        setBusy(true);
        onSelect(canvas);
      }}>{t('Use this page')}</button>
    </div>
  </section>;
}
