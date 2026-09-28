import { useRef, useState } from 'react';
import { Icon } from './Icon';

export function UploadPanel({ ready, preparing, error, onFile, onCamera, onDemo, onRetry }: {
  ready: boolean; preparing: boolean; error: string | null;
  onFile: (file: File) => void; onCamera: () => void; onDemo: () => void; onRetry: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <>
    <h2>Add your identity card</h2>
    <p className="panel-description">Front of older cards, back of newer cards. Keep the MRZ visible.</p>
    <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); if (ready) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (ready && file) onFile(file); }}>
      <Icon name="scan" className="drop-symbol" />
      <h3>Drop an image here</h3>
      <p>JPG, PNG or WebP · up to 15 MB</p>
      <div className="upload-actions">
        <button className="button button-primary" disabled={!ready} onClick={() => input.current?.click()}><Icon name="upload" />Choose image</button>
        <button className="button button-secondary" disabled={!ready} onClick={onCamera}><Icon name="camera" />Use camera</button>
      </div>
      <p className="drop-hint">or choose a clear photo of just the MRZ</p>
      <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose ID image" tabIndex={-1} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (ready && file) onFile(file); }} />
    </div>
    <div className="upload-bottom">
      <button className="text-button" disabled={!ready} onClick={onDemo}>Try a synthetic example<Icon name="arrow" /></button>
      <p className="reader-status" role="status">{ready ? 'Local reader ready' : preparing ? 'Preparing the local reader…' : 'Local reader unavailable'}</p>
    </div>
    {error ? <div className="notice warning" role="alert"><Icon name="alert" /><div><p>{error}</p>{!ready && !preparing ? <button className="text-button" onClick={onRetry}>Retry local reader</button> : null}</div></div> : null}
  </>;
}
