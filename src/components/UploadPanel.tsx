import { useLanguage } from '../i18n';
import { useRef, useState } from 'react';
import { Icon } from './Icon';

export function UploadPanel({ ready, preparing, error, onFile, onCamera, onDemo, onRetry }: {
  ready: boolean; preparing: boolean; error: string | null;
  onFile: (file: File) => void; onCamera: () => void; onDemo: () => void; onRetry: () => void;
}) {
  const { t, message } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <>
    <h2>{t("Add your identity card")}</h2>
    <p className="panel-description">{t("Add a clear photo of one side of your ID. Keep the whole card visible, with no glare.")}</p>
    <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (ready) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (ready && file) onFile(file); }}>
      <Icon name="scan" className="drop-symbol" />
      <h3>{t("Drop an image or PDF here")}</h3>
      <p>{t("JPG, PNG, WebP or PDF · up to 15 MB")}</p>
      <div className="upload-actions">
        <button className="button button-primary" disabled={!ready} onClick={() => input.current?.click()}><Icon name="upload" />{t("Choose file")}</button>
        <button className="button button-secondary" disabled={!ready} onClick={onCamera}><Icon name="camera" />{t("Use camera")}</button>
      </div>
      <p className="drop-hint">{t("One card side at a time. No seller or buyer records are created.")}</p>
      <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" aria-label={t("Choose ID image or PDF")} tabIndex={-1} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (ready && file) onFile(file); }} />
    </div>
    <div className="upload-bottom">
      <button className="text-button" disabled={!ready} onClick={onDemo}>{t("Try a synthetic example")}<Icon name="arrow" /></button>
      <p className="reader-status" role="status">{ready ? t("Local reader ready") : preparing ? t("Preparing the local reader…") : t("Local reader unavailable")}</p>
    </div>
    {error ? <div className="notice warning" role="alert"><Icon name="alert" /><div><p>{message(error)}</p>{!ready && !preparing ? <button className="text-button" onClick={onRetry}>{t("Retry local reader")}</button> : null}</div></div> : null}
  </>;
}
