import { useLanguage, LanguageProvider, LanguageSwitch, readableError } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from './components/Icon';
import { UploadPanel } from './components/UploadPanel';
import { ImageEditor } from './components/ImageEditor';
import { CameraDialog } from './components/CameraDialog';
import { PrivacyDialog } from './components/PrivacyDialog';
import { ReviewForm } from './components/ReviewForm';
import type { ReviewedDetails } from './components/ReviewForm';
import { ValidationSummary } from './components/ValidationSummary';
import { LocalMrzReader } from './lib/ocr';
import type { ScanResult } from './lib/ocr';
import { LocalPrintedReader } from './lib/printed-ocr';
import { assessMrz } from './lib/mrz';
import { IdDetails } from './components/IdDetails';
import { clearCanvas, decodeImage, prepareMrzCanvas } from './lib/image';
import { LocalPdfReader } from './lib/pdf';
import { pdfErrorMessage } from './lib/pdf-message';
import { PdfPagePicker } from './components/PdfPagePicker';
import { createSyntheticMrz } from '../tests/fixtures';

type Phase = 'empty' | 'pdf' | 'decoding' | 'preview' | 'reading' | 'review' | 'confirmed';
type ReaderState = 'preparing' | 'ready' | 'error' | 'stopped';

function AppContent() {
  const { t, message } = useLanguage();
  const [phase, setPhase] = useState<Phase>('empty');
  const [readerState, setReaderState] = useState<ReaderState>('preparing');
  const [progress, setProgress] = useState(0);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [confirmed, setConfirmed] = useState<ReviewedDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const source = useRef<HTMLCanvasElement | null>(null);
  const crop = useRef<HTMLCanvasElement | null>(null);
  const working = useRef<HTMLCanvasElement | null>(null);
  const reader = useRef<LocalMrzReader | null>(null);
  const printedReader = useRef<LocalPrintedReader | null>(null);
  const printedSource = useRef<HTMLCanvasElement | null>(null);
  const pdfReader = useRef<LocalPdfReader | null>(null);
  const [pdfPages, setPdfPages] = useState(0);
  const generation = useRef(0);
  const decoding = useRef(false);
  const reviewRef = useRef<HTMLElement>(null);

  const clearImages = useCallback(() => {
    for (const ref of [source, crop, working, printedSource]) { if (ref.current) clearCanvas(ref.current); ref.current = null; }
    setImage(null);
  }, []);

  const prepareReader = useCallback(async () => {
    setReaderState('preparing');
    setError(null);
    const currentGeneration = generation.current;
    try {
      // Load every UI/data font before accepting an image, too. A font first
      // used by the result screen must not trigger a processing-time request.
      await Promise.all([
        reader.current?.prepare(),
        printedReader.current?.prepare(),
        pdfReader.current?.prepare(),
        // Load each Unicode subset explicitly: WebKit can skip subsets when
        // FontFaceSet.load is given a sample containing mixed ranges.
        ...Array.from(document.fonts, (face) => face.load()),
      ]);
      if (generation.current === currentGeneration && reader.current?.ready && printedReader.current?.ready) setReaderState('ready');
    } catch (failure) {
      if (generation.current !== currentGeneration) return;
      setReaderState('error');
      setError(readableError(failure, 'The local reader could not start. Reload this page.'));
    }
  }, []);

  useEffect(() => {
    const localReader = new LocalMrzReader((value) => { if (value.stage === 'reading') setProgress(value.progress); });
    reader.current = localReader;
    const localPrintedReader = new LocalPrintedReader();
    printedReader.current = localPrintedReader;
    const localPdfReader = new LocalPdfReader();
    pdfReader.current = localPdfReader;
    void prepareReader();
    let retirement: Promise<void> = Promise.resolve();
    const forget = () => {
      generation.current += 1;
      decoding.current = false;
      clearImages();
      setCameraOpen(false);
      setScan(null);
      setConfirmed(null);
      setPhase('empty');
      setReaderState('stopped');
      retirement = Promise.all([localReader.dispose(), localPrintedReader.dispose(), localPdfReader.dispose()]).then(() => {});
    };
    const onPageHide = () => flushSync(forget);
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void retirement.then(prepareReader); };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => { generation.current += 1; clearImages(); void localReader.dispose(); void localPrintedReader.dispose(); void localPdfReader.dispose(); window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow); };
  }, [clearImages, prepareReader]);

  const reset = () => {
    generation.current += 1;
    decoding.current = false;
    clearImages();
    setScan(null); setConfirmed(null); setCameraOpen(false); setError(null); setPhase('empty');
    setReaderState('preparing');
    void Promise.all([reader.current?.dispose(), printedReader.current?.dispose(), pdfReader.current?.dispose()]).then(prepareReader);
  };

  const acceptCanvas = async (canvas: HTMLCanvasElement) => {
    const currentGeneration = generation.current;
    clearImages();
    source.current = canvas;
    setPhase('decoding');
    await pdfReader.current?.dispose();
    if (generation.current !== currentGeneration) { clearCanvas(canvas); return; }
    setImage(canvas); setError(null); setPhase('preview');
  };

  const chooseFile = async (file: File) => {
    if (readerState !== 'ready' || decoding.current) return;
    decoding.current = true;
    const currentGeneration = generation.current;
    setPhase('decoding'); setError(null);
    let isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    try {
      if (!isPdf) isPdf = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) === '%PDF-';
      if (generation.current !== currentGeneration) return;
      if (isPdf) {
        const pages = await pdfReader.current!.open(file);
        if (generation.current !== currentGeneration) return;
        setPdfPages(pages); setPhase('pdf');
        return;
      }
      const canvas = await decodeImage(file);
      if (generation.current !== currentGeneration) { clearCanvas(canvas); return; }
      await acceptCanvas(canvas);
    } catch (failure) {
      if (generation.current !== currentGeneration) return;
      clearImages(); setPhase('empty');
      if (isPdf) {
        await pdfReader.current?.dispose();
        if (generation.current !== currentGeneration) return;
        setReaderState('error'); setError(pdfErrorMessage(failure));
      } else setError(readableError(failure, 'This image could not be opened. Choose a JPG, PNG, or WebP photo.'));
    } finally { if (generation.current === currentGeneration) decoding.current = false; }
  };

  const demo = () => {
    const fixture = createSyntheticMrz('TD1');
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 285;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#171936'; context.font = '48px "IBM Plex Mono", monospace';
    fixture.lines.forEach((line, index) => context.fillText(line, 58, 75 + index * 80));
    acceptCanvas(canvas);
  };

  const read = async (selected: HTMLCanvasElement, full: HTMLCanvasElement, mode: 'mrz' | 'printed') => {
    const currentGeneration = generation.current;
    crop.current = selected;
    printedSource.current = full;
    // The full source image is no longer needed once a crop is selected.
    if (source.current) clearCanvas(source.current);
    source.current = null; setImage(null); setPhase('reading'); setReaderState('stopped'); setProgress(0); setError(null);
    try {
      working.current = prepareMrzCanvas(selected);
      const [mrzOutcome, printedOutcome] = await Promise.allSettled([
        mode === 'mrz' ? reader.current!.read(working.current) : reader.current!.dispose().then(() => ({ assessment: assessMrz(''), confidence: 0 })),
        printedReader.current!.read(full),
      ]);
      if (mrzOutcome.status === 'rejected') throw mrzOutcome.reason;
      if (mode === 'printed' && printedOutcome.status === 'rejected') throw new Error('The printed details could not be read. Try a clearer photo.');
      const result: ScanResult = { ...mrzOutcome.value, mode,
        ...(printedOutcome.status === 'fulfilled' ? { printed: printedOutcome.value } : { printedError: true }),
      };
      if (generation.current !== currentGeneration) return;
      clearImages(); setScan(result); setPhase('review');
      requestAnimationFrame(() => reviewRef.current?.focus({ preventScroll: true }));
    } catch (failure) {
      if (generation.current !== currentGeneration) return;
      setError(readableError(failure, 'The MRZ could not be read. Try a clearer photo.'));
      setPhase('review');
    } finally {
      if (generation.current === currentGeneration) {
        clearImages();
        // Also retire a prepared worker if preprocessing failed before OCR.
        await Promise.all([reader.current?.dispose(), printedReader.current?.dispose()]);
      }
    }
  };

  const step = phase === 'confirmed' || phase === 'review' ? 3 : phase === 'reading' ? 2 : 1;
  return <div className="app-shell">
    <header className="app-header"><a className="wordmark" href={import.meta.env.BASE_URL} aria-label={t("Local ID home")}><Icon name="scan" />Local ID</a><div className="header-actions"><LanguageSwitch /><div className="privacy-indicator"><Icon name="shield" /><span>{t("Only on this device")}</span></div></div></header>
    <main>
      <div className="hero"><h1>{t("Your details. Your device.")}</h1><p>{t("Read and review your Romanian ID, without uploading it.")}</p></div>
      <ol className="steps" aria-label={t("Prefill steps")}>{[t("Add your ID"), t("Read locally"), t("Review details")].map((label, index) => <li className={step === index + 1 ? 'active' : step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined} key={label}><span className="step-number">{step > index + 1 ? <Icon name="check" /> : index + 1}</span><span>{message(label)}</span></li>)}</ol>
      <div className="workspace">
        <section className="panel upload-panel" aria-label={t("Add and read your image")}>
          {phase === 'empty' ? <UploadPanel ready={readerState === 'ready'} preparing={readerState === 'preparing'} error={message(error)} onFile={chooseFile} onCamera={() => setCameraOpen(true)} onDemo={demo} onRetry={prepareReader} /> : null}
          {phase === 'decoding' || phase === 'reading' ? <div className="processing-state" role="status"><Icon name="scan" className="drop-symbol pulse" /><h2>{phase === 'decoding' ? t("Opening your file") : t("Reading on your device")}</h2><p>{phase === 'decoding' ? t("Preparing a temporary image in browser memory.") : t("Reading identity and printed details locally.")}</p>{phase === 'reading' ? <progress max={1} value={progress} aria-label={t("Local OCR progress")} /> : null}<button className="button button-secondary" onClick={reset}>{t("Cancel and clear")}</button></div> : null}
          {phase === 'pdf' && pdfReader.current ? <PdfPagePicker reader={pdfReader.current} pageCount={pdfPages} onSelect={(canvas) => { void acceptCanvas(canvas); }} onCancel={reset} /> : null}
          {phase === 'preview' && image ? <ImageEditor image={image} onRead={read} onCancel={reset} /> : null}
          {phase === 'review' || phase === 'confirmed' ? <div className="scan-result"><div className="result-heading"><span className="result-symbol"><Icon name="shield" /></span><div><h2>{t("Image discarded")}</h2><p className="panel-description">{t("Your image and reading buffers have been cleared.")}</p></div></div>{scan ? <ValidationSummary scan={scan} /> : <div className="notice warning" role="alert"><Icon name="alert" /><p>{message(error)}</p></div>}<button className="button button-secondary" onClick={reset}>{t("Read another image")}</button></div> : null}
        </section>
        <section className="panel review-panel" tabIndex={-1} ref={reviewRef} aria-label={t("Review and confirm details")}>
          {confirmed ? <div className="confirmed-form"><Icon name="check" className="confirmed-symbol" /><h2>{t("Ready to prefill")}</h2><p className="panel-description">{t("You confirmed these details on this device.")}</p><IdDetails details={confirmed} /><p className="notice success"><Icon name="check" />{t("Your reviewed ID details stay in this tab. Nothing was submitted.")}</p><button className="button button-secondary" onClick={reset}>{t("Clear details")}</button></div> : <ReviewForm key={scan ? 'scan' : 'empty'} scan={scan} onConfirm={(details) => { setConfirmed(details); setPhase('confirmed'); }} />}
        </section>
      </div>
    </main>
    <footer className="app-footer"><p><Icon name="lock" />{t("The image is discarded after reading. Nothing is saved.")}</p><button onClick={() => setPrivacyOpen(true)}>{t("How privacy works")}</button></footer>
    {cameraOpen ? <CameraDialog onCapture={(canvas) => { setCameraOpen(false); acceptCanvas(canvas); }} onClose={() => setCameraOpen(false)} /> : null}
    {privacyOpen ? <PrivacyDialog onClose={() => setPrivacyOpen(false)} /> : null}
  </div>;
}

export function App() { return <LanguageProvider><AppContent /></LanguageProvider>; }
