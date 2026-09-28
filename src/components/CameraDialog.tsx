import { useLanguage } from '../i18n';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { clearCanvas } from '../lib/image';

interface CameraDialogProps {
  onCapture: (canvas: HTMLCanvasElement) => void;
  onClose: () => void;
}

type CameraState = 'starting' | 'ready' | 'error';

function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was not granted. Allow camera access in your browser, then try again, or choose an image from your device.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found. Choose an image from your device instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is unavailable or in use by another app. Close that app and try again, or choose an image from your device.';
  }
  return 'We could not start the camera. Try again, or choose an image from your device.';
}

export function CameraDialog({ onCapture, onClose }: CameraDialogProps) {
  const { t, message } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const disposedRef = useRef(false);
  const closedRef = useRef(false);
  const endedCleanupRef = useRef<(() => void) | null>(null);
  const onCaptureRef = useRef(onCapture);
  const onCloseRef = useRef(onClose);
  onCaptureRef.current = onCapture;
  onCloseRef.current = onClose;
  const [state, setState] = useState<CameraState>('starting');
  const [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const titleId = useId();
  const instructionsId = useId();

  const stopCamera = useCallback(() => {
    // Invalidate pending permission requests as well as an active stream.
    generationRef.current += 1;
    endedCleanupRef.current?.();
    endedCleanupRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    stopCamera();
    onCloseRef.current();
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    closedRef.current = false;
    setError('');
    setState('starting');
    if (!window.isSecureContext) {
      setCanRetry(false);
      setState('error');
      setError('Camera access needs HTTPS or localhost. Choose an image from your device instead.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCanRetry(false);
      setState('error');
      setError('This browser does not provide camera access. Choose an image from your device instead.');
      return;
    }
    setCanRetry(true);
    if (document.visibilityState === 'hidden') {
      setState('error');
      setError('Return to this page, then start the camera again.');
      return;
    }
    const generation = generationRef.current;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (disposedRef.current || closedRef.current || generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const activeStream = stream;
      const ended = () => {
        if (streamRef.current !== activeStream || disposedRef.current || closedRef.current) return;
        stopCamera();
        setState('error');
        setError('Camera access ended. Start it again, or choose an image from your device.');
      };
      stream.getTracks().forEach((track) => track.addEventListener('ended', ended));
      endedCleanupRef.current = () => activeStream.getTracks().forEach((track) => track.removeEventListener('ended', ended));
      video.srcObject = stream;
      await video.play();
      if (disposedRef.current || closedRef.current || generation !== generationRef.current) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) setState('ready');
    } catch (failure) {
      if (stream && streamRef.current !== stream) stream.getTracks().forEach((track) => track.stop());
      if (disposedRef.current || closedRef.current || generation !== generationRef.current) return;
      stopCamera();
      setState('error');
      setError(cameraError(failure));
    }
  }, [stopCamera]);

  useEffect(() => {
    disposedRef.current = false;
    closedRef.current = false;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    void startCamera();

    const hide = () => {
      stopCamera();
      if (!disposedRef.current && !closedRef.current) {
        setState('error');
        setError('The camera stopped when this page was hidden. Start it again to continue.');
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const elements = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    return () => {
      disposedRef.current = true;
      closedRef.current = true;
      stopCamera();
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [close, startCamera, stopCamera]);

  function capture() {
    const video = videoRef.current;
    if (state !== 'ready' || !video?.videoWidth || !video.videoHeight || !streamRef.current) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera image preparation failed.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      closedRef.current = true;
      stopCamera();
      onCaptureRef.current(canvas);
    } catch {
      clearCanvas(canvas);
      stopCamera();
      closedRef.current = false;
      setState('error');
      setError('We could not capture this image. Try again, or choose an image from your device.');
    }
  }

  function videoReady() {
    const video = videoRef.current;
    if (streamRef.current && !disposedRef.current && !closedRef.current && video?.videoWidth && video.videoHeight) {
      setState('ready');
    }
  }

  return (
    <div className="camera-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={panelRef}
        className="camera-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={instructionsId}
        tabIndex={-1}
      >
        <div className="camera-dialog-header">
          <h2 id={titleId}>{t("Take a photo")}</h2>
          <button ref={closeButtonRef} className="button button-secondary" type="button" onClick={close}>{t("Close camera")}</button>
        </div>
        <p id={instructionsId}>{t("Keep the card flat and well lit. Capture an image, then select its MRZ.")}</p>
        <video ref={videoRef} className="camera-preview" muted playsInline aria-label={t("Live camera preview")} onLoadedMetadata={videoReady} onCanPlay={videoReady} />
        {state === 'starting' && <p role="status">{t("Waiting for camera access…")}</p>}
        {error && <p className="camera-error field-error" role="alert">{message(error)}</p>}
        <div className="camera-dialog-actions">
          <button className="button button-secondary" type="button" onClick={close}>{t("Choose an image instead")}</button>
          {state === 'error' && canRetry && <button className="button button-secondary" type="button" onClick={() => { void startCamera(); }}>{t("Try camera again")}</button>}
          <button className="button button-primary" type="button" disabled={state !== 'ready'} onClick={capture}>{t("Capture image")}</button>
        </div>
      </div>
    </div>
  );
}
