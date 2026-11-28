'use client';
// EZD-2032 (AC-EZD-2032-2; S18 Page tab: Plans "Read-only viewer of the sheets the contractor shared in this send;
// pinch zoom"; S18 Decision 8; vault/build/assumptions/EZD-1205.md Settled rows, now EZD-2032's; wording rows in
// vault/build/assumptions/EZD-1202.md and EZD-2032.md): the Plans tab. It reads GET /api/c/<token>/sheets when the tab
// opens (the links live 900 s, so they are never baked into the page). "Preparing sheets…" until the images exist
// (read again when the tab is opened again or the page comes back into view; no polling, rule 11); then the sent set's sheets in set order, each a strip thumbnail with its number and
// title. Tapping one opens it full screen with pinch zoom and pan (two fingers zoom, one finger pans when zoomed; a
// wheel zooms on a computer). A link that has run out is fetched again when an image fails
// (only when the list is over 10 minutes old). No library: the client
// entry stays within its budget. Tap to pin a comment comes with EZD-1204.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import { ClientImage } from './ClientImage';
import type { ClientPlansView, ClientSheetView } from './client-page-model';
import styles from './ClientPlans.module.css';

export const MAX_ZOOM = 8;
const LINK_STALE_MS = 10 * 60_000;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'done'; plans: ClientPlansView };

export async function fetchClientSheets(token: string): Promise<ClientPlansView | null> {
  try {
    const res = await fetch(`/api/c/${encodeURIComponent(token)}/sheets`, { cache: 'no-store', credentials: 'omit' });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { plans?: ClientPlansView } | null;
    return body?.plans ?? null;
  } catch {
    return null;
  }
}

/** The viewer's zoom: scale 1 (fit) to MAX_ZOOM, and the offset in screen pixels. */
export type View = { scale: number; x: number; y: number };
export const FIT: View = { scale: 1, x: 0, y: 0 };

/** Zoom by `factor` about the point `at` (relative to the image box's top-left), keeping that point still. */
export function zoomAbout(view: View, factor: number, at: { x: number; y: number }): View {
  const scale = Math.min(MAX_ZOOM, Math.max(1, view.scale * factor));
  if (scale === 1) return FIT;
  const k = scale / view.scale;
  return { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

// `initial` (tests): the tab as already read; it is still read again on open.
export function ClientPlans({ token, initial }: { token: string; initial?: ClientPlansView }) {
  const t = useT();
  const [load, setLoad] = useState<Load>(initial ? { kind: 'done', plans: initial } : { kind: 'loading' });
  const [open, setOpen] = useState<number | null>(null);

  // When the list (and its 900 s links) was last read.
  const readAt = useRef(0);
  const reload = useCallback(() => {
    void fetchClientSheets(token).then((plans) => {
      readAt.current = Date.now();
      setLoad(plans === null ? { kind: 'failed' } : { kind: 'done', plans });
    });
  }, [token]);
  // An image that fails reads the list again only when its links may have run out (read over 10 minutes ago), so an
  // image that cannot load never loops.
  const onImageError = useCallback(() => {
    if (Date.now() - readAt.current > LINK_STALE_MS) reload();
  }, [reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  // No polling (11 Performance rule 11) and no Realtime for a signed-out page: while preparing, the tab is read again
  // when the page comes back into view (and whenever the tab is opened again).
  const preparing = load.kind === 'done' && load.plans.state === 'preparing';
  useEffect(() => {
    if (!preparing) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [preparing, reload]);

  if (load.kind === 'loading') {
    return (
      <p role="status" className={styles.message}>
        {t('client.loading')}
      </p>
    );
  }
  if (load.kind === 'failed') {
    return (
      <div role="alert" className={styles.failed}>
        <p className={styles.message}>{t('client.sheets_failed')}</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setLoad({ kind: 'loading' });
            reload();
          }}
        >
          {t('client.try_again')}
        </button>
      </div>
    );
  }
  if (load.plans.state !== 'ready') {
    return (
      <p role="status" className={styles.message} data-testid="client-plans-preparing">
        {t('client.preparing_sheets')}
      </p>
    );
  }
  const sheets = load.plans.sheets;
  const current = open === null ? undefined : sheets[open];
  return (
    <>
      <ul className={styles.list} aria-label={t('client.sheets')} data-testid="client-plans">
        {sheets.map((s, i) => (
          <li key={`${i}-${s.number}`}>
            <button
              type="button"
              className={styles.sheet}
              aria-label={t('client.sheet_open', { number: s.number, title: s.title })}
              onClick={() => setOpen(i)}
            >
              <span className={styles.thumb} onError={onImageError}>
                <ClientImage
                  previewSrc={s.thumb.src}
                  alt=""
                  width={s.thumb.width}
                  height={s.thumb.height}
                  aboveFold={i < 2}
                />
              </span>
              <span className={styles.label}>
                <span className={styles.number}>{s.number}</span>
                <span className={styles.title}>{s.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current ? <SheetViewer sheet={current} onClose={() => setOpen(null)} onImageError={onImageError} /> : null}
    </>
  );
}

function SheetViewer({
  sheet,
  onClose,
  onImageError,
}: {
  sheet: ClientSheetView;
  onClose: () => void;
  onImageError: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<View>(FIT);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const local = (x: number, y: number) => {
    const r = box.current?.getBoundingClientRect();
    return { x: x - (r?.left ?? 0), y: y - (r?.top ?? 0) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the moves still arrive on the stage.
    }
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ps = pointers.current;
    const before = ps.get(e.pointerId);
    if (!before) return;
    const after = local(e.clientX, e.clientY);
    if (ps.size >= 2) {
      const [other] = [...ps.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      if (other) {
        const d0 = Math.hypot(before.x - other.x, before.y - other.y);
        const d1 = Math.hypot(after.x - other.x, after.y - other.y);
        if (d0 > 0) {
          const mid = { x: (after.x + other.x) / 2, y: (after.y + other.y) / 2 };
          setView((v) => zoomAbout(v, d1 / d0, mid));
        }
      }
    } else {
      setView((v) => (v.scale === 1 ? v : { ...v, x: v.x + after.x - before.x, y: v.y + after.y - before.y }));
    }
    ps.set(e.pointerId, after);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    setView((v) => zoomAbout(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, local(e.clientX, e.clientY)));
  };

  return (
    <div
      className={styles.viewer}
      role="dialog"
      aria-modal="true"
      aria-label={`${sheet.number} ${sheet.title}`}
      data-testid="client-sheet-viewer"
    >
      <div className={styles.viewerBar}>
        <p className={styles.viewerTitle}>
          <span className={styles.number}>{sheet.number}</span> {sheet.title}
        </p>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label={t('client.sheet_close')}
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div
        ref={box}
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onError={onImageError}
        data-zoom={view.scale.toFixed(2)}
        data-testid="client-sheet-stage"
      >
        <div
          className={styles.zoom}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <ClientImage previewSrc={sheet.src} alt={`${sheet.number} ${sheet.title}`} width={sheet.width} height={sheet.height} aboveFold />
        </div>
      </div>
    </div>
  );
}
