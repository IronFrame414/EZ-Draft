'use client';
// EZD-505 (S05 Controls "Spacing dimension pill (e.g. "4' 0" o.c."): Canvas, above selected beam set. Shows spacing.
// Click to type a new spacing. Typed dimension on every edit."; board S05Ceiling): the pill over one selected beam
// set on Ceiling or Both. With Edit model a click opens a typed entry; Enter applies it (one undo step), Esc keeps the
// old spacing, and a refused entry shows its message and changes nothing (S05 Validation "Typed heights").
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { PlanCanvasHandle } from '../plan/controller';
import type { SelectionController } from '../selection/selection-controller';
import { beamEdit, beamPillAnchor, beamView, isBeam } from './beam-edits';
import styles from './BeamSpacingPill.module.css';

export type BeamSpacingPillProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  selection: Pick<SelectionController, 'getUi' | 'subscribe'>;
  handle: Pick<PlanCanvasHandle, 'modelToScreen' | 'onCameraChange'>;
  canEdit: boolean;
};

/** The gap between the set's far edge and the pill's bottom, in screen pixels. */
const PILL_GAP_PX = 8;

export function BeamSpacingPill({
  store,
  selection,
  handle,
  canEdit,
}: BeamSpacingPillProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const id = ui.ids.length === 1 && isBeam(objects, ui.ids[0]!) ? ui.ids[0]! : null;
  const view = useMemo(() => (id === null ? null : beamView(objects, id)), [objects, id]);
  const anchor = useMemo(() => (id === null ? null : beamPillAnchor(objects, id)), [objects, id]);
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  const place = useCallback(() => {
    const el = ref.current;
    if (el === null || anchor === null) return;
    const s = handle.modelToScreen(anchor);
    el.style.transform = `translate(${s.x}px, ${s.y - PILL_GAP_PX}px) translate(-50%, -100%)`;
  }, [handle, anchor]);
  useEffect(() => {
    place();
    return handle.onCameraChange(place);
  }, [handle, place]);

  if (id === null || view === null || anchor === null || view.count === 0) return null;
  const editing = draft !== null && draft.id === id && canEdit;
  const shown = t('office.beam.on_center', { spacing: view.spacing });

  const commit = () => {
    if (draft === null) return;
    const r = beamEdit(store.getState().objects, id, { field: 'spacing', text: draft.text });
    if (!r.ok) {
      setError(r.messageKey);
      return;
    }
    store.applyEdit([r.change]);
    setDraft(null);
    setError(null);
  };

  return (
    <div ref={ref} className={styles.anchor} data-testid="beam-spacing">
      {editing ? (
        <input
          className={styles.input}
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          aria-label={t('office.beam.spacing')}
          aria-invalid={error !== null}
          data-testid="beam-spacing-input"
          value={draft.text}
          onChange={(e) => setDraft({ id, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
              setError(null);
            }
          }}
          onBlur={() => {
            setDraft(null);
            setError(null);
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.pill}
          data-testid="beam-spacing-pill"
          disabled={!canEdit}
          onClick={() => {
            setDraft({ id, text: view.spacing });
            setError(null);
          }}
        >
          {shown}
        </button>
      )}
      {editing && error !== null ? (
        <p className={styles.error} role="alert" data-testid="beam-spacing-error">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
