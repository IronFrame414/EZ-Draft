'use client';
// EZD-503 (S05 Controls "Room ceiling summary", "Change ceiling", "Read heights from scan (not in mockup)"; S05 Layout
// "Left panel (248px): Floor / Ceiling / Both segment; current room ceiling summary; ..."; S05 Permissions "change
// ceiling type and heights: Edit model"; S05 Validation "Typed heights: invalid format shows inline error, value not
// applied"; board S05Ceiling left panel; AC-EZD-503-1): the left panel's room ceiling section on Ceiling or Both. The
// summary is read only and follows the active room (room-ceiling.ts activeRoomId). With Edit model, Change ceiling
// opens the ceiling type editor in place under the summary (vault/build/assumptions.md EZD-503); Save writes one model
// change (one undo step). Read heights from scan shows only when the project has a GLB (`readScan`). Loaded lazily
// with the RCP (rcp-module.ts).
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { CEILING_TYPES, type CeilingHeightsBy, type CeilingType } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import {
  activeRoomId,
  ceilingDraft,
  ceilingSummary,
  createScanGate,
  fillFromScan,
  HIGH_SIDES,
  isSloped,
  RIDGE_DIRECTIONS,
  saveCeiling,
  summaryHeights,
  type CeilingDraft,
  type DraftError,
  type DraftField,
  type RidgeDirection,
  type ScanRefusal,
} from './room-ceiling';
import type { ScanCeiling } from './scan';
import styles from './RoomCeiling.module.css';

export type RoomCeilingProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  selection: Pick<SelectionController, 'getUi' | 'subscribe'>;
  floors?: FloorChoice;
  canEdit: boolean;
  /** The project's mesh ceiling; absent when the project has no GLB (no Read heights from scan). */
  readScan?: () => Promise<ScanCeiling>;
};

const HEIGHTS_BY: readonly CeilingHeightsBy[] = ['wall', 'point', 'pitch'];
// Message keys are lower case (catalog key format).
const lowerSide = (s: CeilingDraft['highSide']) => s.toLowerCase() as 'n' | 'e' | 's' | 'w';

export function RoomCeiling({
  store,
  selection,
  floors,
  canEdit,
  readScan,
}: RoomCeilingProps): ReactElement {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const roomId = useMemo(
    () => activeRoomId(objects, openFloorId(objects, chosen), ui.ids),
    [objects, chosen, ui.ids],
  );
  const summary = useMemo(
    () => (roomId === null ? null : ceilingSummary(objects, roomId)),
    [objects, roomId],
  );
  // The open editor: its room and draft. It closes on Save, Cancel or when the active room changes.
  const [open, setOpen] = useState<{ roomId: string; draft: CeilingDraft } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<DraftField, DraftError>>>({});
  const [scan, setScan] = useState<'idle' | 'reading' | 'failed' | ScanRefusal>('idle');
  // One scan read belongs to the editor that asked for it (room-ceiling.ts createScanGate).
  const [gate] = useState(createScanGate);
  const editing =
    open !== null && roomId !== null && open.roomId.toLowerCase() === roomId.toLowerCase();

  if (summary === null)
    return (
      <section className={styles.section} data-testid="room-ceiling">
        <span className={styles.lbl}>{t('office.ceiling.summary.no_room')}</span>
      </section>
    );

  // Board S05Ceiling: the summary says "Vaulted"; the type select keeps "Vaulted/cathedral".
  const typeText =
    summary.type === 'vaulted'
      ? t('office.ceiling.summary.vaulted')
      : t(`office.left_panel.ceiling_type.${summary.type}`);
  const typeLine =
    summary.ridgeDirection === null
      ? typeText
      : t('office.ceiling.summary.type_ridge', {
          type: typeText,
          direction: t(`office.ceiling.summary.direction.${summary.ridgeDirection}`),
        });

  const begin = () => {
    const draft = ceilingDraft(store.getState().objects, summary.roomId);
    if (draft === null) return;
    gate.reset();
    setErrors({});
    setScan('idle');
    setOpen({ roomId: summary.roomId, draft });
  };
  const close = () => {
    gate.reset();
    setOpen(null);
    setErrors({});
    setScan('idle');
  };
  const update = (patch: Partial<CeilingDraft>) =>
    setOpen((o) => (o === null ? o : { ...o, draft: { ...o.draft, ...patch } }));
  const save = () => {
    if (!editing || !canEdit) return;
    const r = saveCeiling(store.getState().objects, open.roomId, open.draft);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    if (r.change !== null) store.applyEdit([r.change]);
    close();
  };
  const readHeights = () => {
    if (!editing || readScan === undefined) return;
    setScan('reading');
    const from = open.draft;
    const ticket = gate.ask(open.roomId);
    // A result for an editor that was closed, reopened or opened on another room since the press is dropped.
    readScan().then(
      (s) => {
        if (!gate.accepts(ticket, ticket.roomId)) return;
        const filled = fillFromScan(from, s.mesh);
        if (!filled.ok) {
          setScan(filled.reason);
          return;
        }
        setErrors({});
        setScan('idle');
        setOpen((o) =>
          gate.accepts(ticket, o?.roomId ?? null) ? { ...o!, draft: filled.draft } : o,
        );
      },
      () => {
        if (gate.accepts(ticket, ticket.roomId)) setScan('failed');
      },
    );
  };

  const errorText = (e: DraftError | undefined) =>
    e === undefined
      ? null
      : e === 'format'
        ? t('office.length.refused')
        : e === 'ridge_low'
          ? t('office.ceiling.editor.ridge_low')
          : t('office.ceiling.editor.pitch_refused');

  const lengthInput = (
    testId: string,
    label: string,
    value: string,
    field: DraftField,
    onText: (text: string) => void,
  ) => {
    const err = errorText(errors[field]);
    return (
      <label key={testId} className={styles.field}>
        {label}
        <input
          className={styles.input}
          data-testid={testId}
          value={value}
          aria-invalid={err !== null}
          onChange={(e) => onText(e.target.value)}
        />
        {err === null ? null : (
          <span className={styles.error} role="alert" data-testid={`${testId}-error`}>
            {err}
          </span>
        )}
      </label>
    );
  };

  const editor = (d: CeilingDraft) => {
    const sloped = isSloped(d.type);
    const by = !sloped && d.heightsBy === 'pitch' ? 'wall' : d.heightsBy;
    const scanText =
      scan === 'reading'
        ? null
        : scan === 'failed'
          ? t('office.ceiling.editor.scan_failed')
          : scan === 'no_ceiling'
            ? t('office.ceiling.editor.scan_no_ceiling')
            : scan === 'not_covered'
              ? t('office.ceiling.editor.scan_not_covered')
              : null;
    return (
      <div className={styles.editor} data-testid="ceiling-editor">
        <label className={styles.field}>
          {t('office.ceiling.editor.type')}
          <select
            className={styles.select}
            data-testid="ceiling-editor-type"
            value={d.type}
            onChange={(e) => update({ type: e.target.value as CeilingType })}
          >
            {CEILING_TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`office.left_panel.ceiling_type.${v}`)}
              </option>
            ))}
          </select>
        </label>
        {d.type === 'vaulted' ? (
          <label className={styles.field}>
            {t('office.ceiling.editor.ridge_direction')}
            <select
              className={styles.select}
              data-testid="ceiling-editor-ridge-direction"
              value={d.ridgeDirection}
              onChange={(e) => update({ ridgeDirection: e.target.value as RidgeDirection })}
            >
              {RIDGE_DIRECTIONS.map((v) => (
                <option key={v} value={v}>
                  {t(`office.ceiling.editor.direction.${v}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {d.type === 'single_slope' ? (
          <label className={styles.field}>
            {t('office.ceiling.editor.high_side')}
            <select
              className={styles.select}
              data-testid="ceiling-editor-high-side"
              value={d.highSide}
              onChange={(e) => update({ highSide: e.target.value as CeilingDraft['highSide'] })}
            >
              {HIGH_SIDES.map((v) => (
                <option key={v} value={v}>
                  {t(`office.ceiling.editor.side.${lowerSide(v)}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className={styles.field}>
          {t('office.ceiling.editor.heights_by')}
          <div
            className={styles.segment}
            role="group"
            aria-label={t('office.ceiling.editor.heights_by')}
          >
            {HEIGHTS_BY.filter((v) => sloped || v !== 'pitch').map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={by === v}
                className={`${styles.seg} ${by === v ? styles.segOn : ''} ${touch.target}`}
                data-testid={`ceiling-editor-by-${v}`}
                onClick={() => update({ heightsBy: v })}
              >
                {t(`office.ceiling.editor.by.${v}`)}
              </button>
            ))}
          </div>
        </div>
        {by === 'wall'
          ? d.walls.map((w, i) =>
              lengthInput(
                `ceiling-editor-wall-${i}`,
                t('office.ceiling.editor.wall_row', {
                  side: t(`office.ceiling.editor.side.${lowerSide(w.side)}`),
                }),
                w.text,
                `wall:${i}`,
                (text) => update({ walls: d.walls.map((x, j) => (j === i ? { ...x, text } : x)) }),
              ),
            )
          : null}
        {by === 'point'
          ? d.points.map((p, i) =>
              lengthInput(
                `ceiling-editor-point-${i}`,
                t('office.ceiling.editor.point_row', { n: i + 1 }),
                p.text,
                `point:${i}`,
                (text) =>
                  update({ points: d.points.map((x, j) => (j === i ? { ...x, text } : x)) }),
              ),
            )
          : null}
        {sloped && by !== 'pitch'
          ? lengthInput(
              'ceiling-editor-ridge',
              t(
                d.type === 'vaulted'
                  ? 'office.ceiling.editor.ridge_height'
                  : 'office.ceiling.editor.high_height',
              ),
              d.ridgeText,
              'ridge',
              (text) => update({ ridgeText: text }),
            )
          : null}
        {sloped && by === 'pitch'
          ? lengthInput(
              'ceiling-editor-pitch',
              t('office.ceiling.editor.pitch'),
              d.pitchText,
              'pitch',
              (text) => update({ pitchText: text }),
            )
          : null}
        {readScan === undefined ? null : (
          <button
            type="button"
            className={`${styles.button} ${touch.target}`}
            data-testid="ceiling-editor-read-scan"
            disabled={scan === 'reading'}
            onClick={readHeights}
          >
            {t(
              scan === 'reading'
                ? 'office.ceiling.editor.reading_scan'
                : 'office.ceiling.editor.read_scan',
            )}
          </button>
        )}
        {scanText === null ? null : (
          <p className={styles.error} role="alert" data-testid="ceiling-editor-scan-error">
            {scanText}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${touch.target}`}
            data-testid="ceiling-editor-cancel"
            onClick={close}
          >
            {t('office.ceiling.editor.cancel')}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary} ${touch.target}`}
            data-testid="ceiling-editor-save"
            onClick={save}
          >
            {t('office.ceiling.editor.save')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.section} data-testid="room-ceiling" data-room={summary.roomId}>
      <span className={styles.lbl} data-testid="room-ceiling-heading">
        {t('office.ceiling.summary.heading', { room: summary.name })}
      </span>
      <span className={styles.type} data-testid="room-ceiling-type">
        {typeLine}
      </span>
      <span className={styles.heights} data-testid="room-ceiling-heights">
        {summaryHeights(summary, {
          walls: t('office.ceiling.summary.walls'),
          ridge: t('office.ceiling.summary.ridge'),
        })}
      </span>
      {!canEdit ? null : editing ? (
        editor(open.draft)
      ) : (
        <button
          type="button"
          className={`${styles.button} ${touch.target}`}
          data-testid="room-ceiling-change"
          onClick={begin}
        >
          {t('office.ceiling.change')}
        </button>
      )}
    </section>
  );
}
