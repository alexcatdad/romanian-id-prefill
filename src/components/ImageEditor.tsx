import { useLanguage } from '../i18n';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { clearCanvas } from '../lib/image';

interface ImageEditorProps {
  image: HTMLCanvasElement;
  onRead: (crop: HTMLCanvasElement, full: HTMLCanvasElement, mode: 'mrz' | 'printed') => void;
  onCancel: () => void;
}

interface Selection {
  top: number;
  bottom: number;
}

interface Drag {
  pointerId: number;
  mode: 'top' | 'bottom' | 'move';
  startY: number;
  selection: Selection;
}

const MIN_SELECTION = 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const initialSelection = (image: HTMLCanvasElement): Selection => ({
  top: image.width / image.height > 4 ? 0 : 68,
  bottom: 100,
});

export function ImageEditor({ image, onRead, onCancel }: ImageEditorProps) {
  const { t, message } = useLanguage();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef(image);
  const workingRef = useRef(image);
  const dragRef = useRef<Drag | null>(null);
  const [rotation, setRotation] = useState(0);
  const [selection, setSelection] = useState(() => initialSelection(image));
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [mode, setMode] = useState<'mrz' | 'printed'>('mrz');
  const topId = useId();
  const bottomId = useId();
  const instructionsId = useId();

  useLayoutEffect(() => {
    if (originalRef.current === image) return;
    if (workingRef.current !== originalRef.current) clearCanvas(workingRef.current);
    originalRef.current = image;
    workingRef.current = image;
    setRotation(0);
    setSelection(initialSelection(image));
    setReading(false);
    setError('');
  }, [image]);

  useLayoutEffect(() => {
    const source = workingRef.current;
    const preview = previewRef.current;
    if (!preview || !source.width || !source.height) return;
    preview.width = source.width;
    preview.height = source.height;
    const context = preview.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0);
    const top = source.height * selection.top / 100;
    const bottom = source.height * selection.bottom / 100;
    context.fillStyle = 'rgba(0, 0, 0, 0.56)';
    context.fillRect(0, 0, source.width, top);
    context.fillRect(0, bottom, source.width, source.height - bottom);
    context.strokeStyle = '#8475e5';
    context.lineWidth = Math.max(2, source.width / 250);
    const inset = context.lineWidth / 2;
    context.strokeRect(inset, top + inset, source.width - context.lineWidth, Math.max(1, bottom - top - context.lineWidth));
  }, [image, rotation, selection]);

  useEffect(() => {
    const preview = previewRef.current;
    return () => {
      dragRef.current = null;
      if (workingRef.current !== originalRef.current) clearCanvas(workingRef.current);
      if (preview) clearCanvas(preview);
    };
  }, []);

  function rotate(direction: -1 | 1) {
    setError('');
    const nextRotation = (rotation + direction * 90 + 360) % 360;
    let next = image;
    if (nextRotation !== 0) {
      next = document.createElement('canvas');
      const swapSides = nextRotation === 90 || nextRotation === 270;
      next.width = swapSides ? image.height : image.width;
      next.height = swapSides ? image.width : image.height;
      const context = next.getContext('2d');
      if (!context) {
        clearCanvas(next);
        setError('This browser could not rotate the image.');
        return;
      }
      context.translate(next.width / 2, next.height / 2);
      context.rotate(nextRotation * Math.PI / 180);
      context.drawImage(image, -image.width / 2, -image.height / 2);
    }
    if (workingRef.current !== image) clearCanvas(workingRef.current);
    workingRef.current = next;
    setRotation(nextRotation);
    setSelection(mode === 'printed' ? { top: 0, bottom: 100 } : initialSelection(next));
  }

  function pointerY(event: PointerEvent<HTMLCanvasElement>): number {
    const rectangle = event.currentTarget.getBoundingClientRect();
    if (rectangle.height <= 0) return 0;
    return clamp((event.clientY - rectangle.top) / rectangle.height * 100, 0, 100);
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (reading || mode === 'printed' || event.button !== 0) return;
    event.preventDefault();
    const y = pointerY(event);
    const rectangle = event.currentTarget.getBoundingClientRect();
    const distanceTop = Math.abs(y - selection.top) / 100 * rectangle.height;
    const distanceBottom = Math.abs(y - selection.bottom) / 100 * rectangle.height;
    const nearestEdge = distanceTop <= distanceBottom ? 'top' : 'bottom';
    const dragMode = Math.min(distanceTop, distanceBottom) <= 24 || y < selection.top || y > selection.bottom
      ? nearestEdge
      : 'move';
    dragRef.current = { pointerId: event.pointerId, mode: dragMode, startY: y, selection: { ...selection } };
    event.currentTarget.setPointerCapture(event.pointerId);
    moveDrag(event);
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const y = pointerY(event);
    if (drag.mode === 'top') {
      setSelection({ ...drag.selection, top: clamp(Math.round(y), 0, drag.selection.bottom - MIN_SELECTION) });
    } else if (drag.mode === 'bottom') {
      setSelection({ ...drag.selection, bottom: clamp(Math.round(y), drag.selection.top + MIN_SELECTION, 100) });
    } else {
      const height = drag.selection.bottom - drag.selection.top;
      const top = clamp(Math.round(drag.selection.top + y - drag.startY), 0, 100 - height);
      setSelection({ top, bottom: top + height });
    }
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function readSelection() {
    const source = workingRef.current;
    const crop = document.createElement('canvas');
    let full: HTMLCanvasElement | null = null;
    const top = Math.floor(source.height * selection.top / 100);
    const bottom = Math.max(top + 1, Math.ceil(source.height * selection.bottom / 100));
    crop.width = source.width;
    crop.height = bottom - top;
    try {
      const context = crop.getContext('2d');
      if (!context || !source.width || !source.height) throw new Error('The image is unavailable.');
      context.drawImage(source, 0, top, source.width, crop.height, 0, 0, crop.width, crop.height);
      setReading(true);
      full = document.createElement('canvas');
      full.width = source.width; full.height = source.height;
      const fullContext = full.getContext('2d');
      if (!fullContext) { clearCanvas(full); throw new Error('Image unavailable'); }
      fullContext.drawImage(source, 0, 0);
      onRead(crop, full, mode);
    } catch {
      clearCanvas(crop);
      if (full) clearCanvas(full);
      setReading(false);
      setError('We could not prepare that selection. Choose another image and try again.');
    }
  }

  return (
    <section className="image-editor" aria-label={t("Select the machine-readable zone")}>
      <h2>{mode === 'mrz' ? t("Select the MRZ") : t("Read the printed side")}</h2>
      <fieldset className="read-mode"><legend>{t("Which side are you reading?")}</legend>
        <label><input type="radio" name="read-mode" checked={mode === 'mrz'} disabled={reading} onChange={() => setMode('mrz')} />{t("Side with MRZ")}</label>
        <label><input type="radio" name="read-mode" checked={mode === 'printed'} disabled={reading} onChange={() => { setMode('printed'); setSelection({ top: 0, bottom: 100 }); }} />{t("Printed side without MRZ")}</label>
      </fieldset>
      <p className="field-hint">{mode === 'mrz' ? t("The whole card is also read for printed details. Include its complete address in the image.") : t("Printed text has no MRZ checks. Every extracted field needs your review.")}</p>
      <p id={instructionsId} className="editor-instructions">
        {mode === 'mrz' ? t("Select every row of letters, numbers and < in the MRZ. Drag its edges or use the controls below.") : t("Keep the complete card visible and upright. This reads the whole image.")}
      </p>
      <canvas
        ref={previewRef}
        className="image-editor-preview"
        role="img"
        aria-label={t("Your identity card with the selected MRZ area highlighted")}
        aria-describedby={instructionsId}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => { dragRef.current = null; }}
      />
      <div className="image-editor-toolbar">
        <button className="button button-secondary" type="button" disabled={reading} onClick={() => rotate(-1)}>{t("Rotate left 90°")} </button>
        <button className="button button-secondary" type="button" disabled={reading} onClick={() => rotate(1)}>{t("Rotate right 90°")} </button>
        <button className="button button-secondary" type="button" disabled={reading} onClick={() => setSelection(mode === 'printed' ? { top: 0, bottom: 100 } : initialSelection(workingRef.current))}>{t("Reset crop")} </button>
        <button className="button button-secondary" type="button" disabled={reading} onClick={() => setSelection({ top: 0, bottom: 100 })}>{t("Use whole image")} </button>
      </div>
      <div className="crop-controls" hidden={mode === 'printed'}>
        <div className="crop-control">
          <label htmlFor={topId}>{t("Top edge")} <span>{selection.top}%</span></label>
          <input
            id={topId}
            type="range"
            min={0}
            max={selection.bottom - MIN_SELECTION}
            step={1}
            value={selection.top}
            disabled={reading}
            aria-valuetext={`${selection.top} ${t("percent from the top of the image")}`}
            onChange={(event) => setSelection((current) => ({ ...current, top: Number(event.target.value) }))}
          />
        </div>
        <div className="crop-control">
          <label htmlFor={bottomId}>{t("Bottom edge")} <span>{selection.bottom}%</span></label>
          <input
            id={bottomId}
            type="range"
            min={selection.top + MIN_SELECTION}
            max={100}
            step={1}
            value={selection.bottom}
            disabled={reading}
            aria-valuetext={`${selection.bottom} ${t("percent from the top of the image")}`}
            onChange={(event) => setSelection((current) => ({ ...current, bottom: Number(event.target.value) }))}
          />
        </div>
      </div>
      {error && <p className="field-error" role="alert">{message(error)}</p>}
      <div className="image-editor-actions">
        <button className="button button-secondary" type="button" disabled={reading} onClick={onCancel}>{t("Discard image")}</button>
        <button className="button button-primary" type="button" disabled={reading} onClick={readSelection}>
          {reading ? t("Preparing selection…") : mode === 'mrz' ? t("Read selected MRZ") : t("Read printed details")}
        </button>
      </div>
    </section>
  );
}
