'use client';

// EZD-304 (S01 PDF: scale calibration "After upload, PDF only | Click two points on the page, type the real distance |
// Required before tracing. Stored in source_file.scale_calibration"; W2 step 1; Q-0203 a PDF with no known scale
// never blocks, the scale can be added later; Q-0760 no board, built in the style of the Upload step): the set-scale
// step of one uploaded PDF. Page 1 is drawn to fit; each click sets a point (a third click starts over); the typed
// distance is read as a length (03g). Save scale stores it; Skip for now leaves the PDF without a scale. It rides in
// the pdf-underlay lazy module with pdf.js (11 Budgets), opened by components/imports/ScaleCalibration.
import { Dialog } from 'radix-ui';
import { useEffect, useState, type MouseEvent, type ReactElement } from 'react';
import {
  calibrationOf,
  parseCalibrationLength,
  type PdfPoint,
  type ScaleCalibration,
} from '../../lib/imports/scale-calibration';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { PdfPage } from './pdf-page';
import shell from '../../components/projects/NewProject.module.css';
import { StateButton } from '../../components/states/StateButton';
import styles from './ScaleCalibrationDialog.module.css';

/** The page view's box in CSS pixels; the page is drawn to fit inside it. */
const VIEW_W = 720;
const VIEW_H = 440;

export type ScaleCalibrationProps = {
  name: string;
  sourceFileId: string;
  page: PdfPage;
  onDone: (saved: ScaleCalibration | null) => void;
  fetchImpl?: typeof fetch;
};

export function ScaleCalibrationDialog({
  name,
  sourceFileId,
  page,
  onDone,
  fetchImpl,
}: ScaleCalibrationProps): ReactElement {
  const t = useT();
  // A callback ref: the dialog's portal mounts the canvas after the first effects run.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  // The drawn page: image pixels per point, the image size and device pixels per CSS pixel.
  const [drawn, setDrawn] = useState<{
    scale: number;
    width: number;
    height: number;
    dpr: number;
  } | null>(null);
  const scale = drawn?.scale ?? null;
  const [points, setPoints] = useState<PdfPoint[]>([]);
  const [distance, setDistance] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasEl;
    if (canvas === null) return;
    let live = true;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const fit = Math.min(VIEW_W / page.widthPt, VIEW_H / page.heightPt);
    const s = fit * dpr;
    void page.draw(canvas, s).then(
      () => {
        if (!live) return;
        canvas.style.width = `${canvas.width / dpr}px`;
        canvas.style.height = `${canvas.height / dpr}px`;
        setDrawn({ scale: s, width: canvas.width, height: canvas.height, dpr });
      },
      () => {
        if (live) setError('office.pdf_scale.open_failed');
      },
    );
    return () => {
      live = false;
    };
  }, [page, canvasEl]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasEl;
    if (canvas === null || scale === null || busy) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const p = page.toPdf(scale, x, y);
    setError(null);
    setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  };

  const typed = parseCalibrationLength(distance);
  const ready = points.length === 2 && typed.ok && !busy;

  const save = async () => {
    if (points.length !== 2) return;
    if (!typed.ok) {
      setError(typed.messageKey);
      return;
    }
    const cal = calibrationOf(page.pageNumber, points[0], points[1], typed.inches);
    if (cal === null) {
      setError('office.pdf_scale.too_close');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await (fetchImpl ?? fetch)(`/api/source-files/${sourceFileId}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ scaleCalibration: cal }),
      });
      if (res.status !== 200) throw new Error('scale');
      onDone(cal);
      return;
    } catch {
      setError('office.pdf_scale.save_failed');
    }
    setBusy(false);
  };

  const hint: MessageKey =
    points.length === 0
      ? 'office.pdf_scale.pick_first'
      : points.length === 1
        ? 'office.pdf_scale.pick_second'
        : 'office.pdf_scale.points_set';
  const marks = drawn === null ? [] : points.map((p) => page.toImage(drawn.scale, p));

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className={shell.overlay} />
        <Dialog.Content
          data-testid="pdf-scale"
          lang={t.language}
          className={`${shell.content} ${styles.content}`}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className={shell.header}>
            <div className={shell.headText}>
              <Dialog.Title className={shell.title}>
                {t('office.pdf_scale.title', { name })}
              </Dialog.Title>
              <Dialog.Description className={shell.subtitle}>
                {t('office.pdf_scale.sub')}
              </Dialog.Description>
            </div>
          </div>
          <div className={shell.body}>
            <div className={styles.view} data-testid="pdf-scale-view">
              <div className={styles.page}>
                <canvas
                  ref={setCanvasEl}
                  className={styles.canvas}
                  data-testid="pdf-scale-page"
                  data-state={scale === null ? 'drawing' : 'ready'}
                  data-width-pt={page.widthPt}
                  data-height-pt={page.heightPt}
                  aria-label={t('office.pdf_scale.page_label', { name })}
                  onClick={onClick}
                />
                {drawn !== null && marks.length > 0 ? (
                  <svg
                    className={styles.marks}
                    viewBox={`0 0 ${drawn.width} ${drawn.height}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {marks.length === 2 ? (
                      <line
                        className={styles.line}
                        x1={marks[0].x}
                        y1={marks[0].y}
                        x2={marks[1].x}
                        y2={marks[1].y}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {marks.map((m, i) => (
                      <circle
                        key={i}
                        data-testid="pdf-scale-point"
                        className={styles.point}
                        cx={m.x}
                        cy={m.y}
                        r={6 * drawn.dpr}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                ) : null}
              </div>
            </div>
            <p data-testid="pdf-scale-hint" role="status" className={shell.hint}>
              {t(hint)}
            </p>
            <label className={shell.field}>
              {t('office.pdf_scale.distance')}
              <input
                data-testid="pdf-scale-distance"
                className={shell.input}
                inputMode="decimal"
                autoComplete="off"
                placeholder={`12' 0"`}
                value={distance}
                disabled={busy}
                onChange={(e) => {
                  setDistance(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save();
                }}
              />
            </label>
            {error !== null ? (
              <p data-testid="pdf-scale-error" role="alert" className={shell.error}>
                {t(error, { name })}
              </p>
            ) : null}
          </div>
          <div className={shell.footer}>
            <span className={shell.spacer} />
            <StateButton data-testid="pdf-scale-skip" disabled={busy} onClick={() => onDone(null)}>
              {t('office.pdf_scale.skip')}
            </StateButton>
            <StateButton
              data-testid="pdf-scale-save"
              variant="primary"
              className={shell.createButton}
              disabled={!ready}
              onClick={() => void save()}
            >
              {t('office.pdf_scale.save')}
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
