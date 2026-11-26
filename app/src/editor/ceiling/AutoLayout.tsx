'use client';
// EZD-509 (S05 Controls "Auto-layout cans | Left panel, Lighting | Opens auto-layout: by count, by spacing, or by
// light-level target in foot-candles. Places cans in the room. | Edit model. Result shown for confirmation before it
// is committed (AI/auto results never applied silently)."; S05 Decision 6; board S05Ceiling Lighting "Auto-layout
// cans"; Q-0769 built from the written spec in the board's style; AC-EZD-509-3; vault/build/assumptions/EZD-509.md):
// the Auto-layout cans button and its panel. While open, the cans it would place show as ghosts on the canvas with a
// count line; nothing is in the model until Place, which adds them all as one edit (one undo step). Cancel, closing,
// a room change or leaving the Ceiling view drops the preview.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { parseLength, type Point } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import { snapToActTile } from '../tools/act-grid-edits';
import {
  canTypes,
  gridByCount,
  gridBySpacing,
  layoutRoom,
  lightLevelCount,
  placeCans,
  snapPoints,
  type LayoutMode,
} from './auto-layout';
import { autoLayoutDraftFor } from './auto-layout-draft';
import { activeRoomId } from './room-ceiling';
import type { SurfaceSetting } from './surface';
import parts from './CeilingParts.module.css';
import styles from './AutoLayout.module.css';

/** The Defaults auto-layout reads: the foot-candle target per room type, CU and LLF (null while Not set). */
export type AutoLayoutDefaults = {
  lightTargets: Readonly<Record<string, number>> | null;
  cu: number | null;
  llf: number | null;
};

export type AutoLayoutProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'select'>;
  floors?: FloorChoice;
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>;
  canEdit: boolean;
  defaults: AutoLayoutDefaults;
  newId: () => string;
  newStatus: () => 'existing' | 'demo' | 'new';
  /** EZD-511: the Defaults "ACT minimum border" as a share of the tile. */
  actMinShare?: number;
};

const MODES: readonly LayoutMode[] = ['count', 'spacing', 'light'];
const WHOLE = /^\d+$/;
const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

type Result = { points: Point[]; note: { key: MessageKey; vars?: Record<string, string> } | null };

export function AutoLayout(props: AutoLayoutProps): ReactElement {
  const { store, selection, floors, surface, canEdit, defaults } = props;
  const t = useT();
  const draft = autoLayoutDraftFor(surface);
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
  const room = useMemo(() => (roomId === null ? null : layoutRoom(objects, roomId)), [objects, roomId]);
  const types = useMemo(() => canTypes(objects), [objects]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LayoutMode>('count');
  const [countText, setCountText] = useState('');
  const [spacingText, setSpacingText] = useState('');
  const [targetText, setTargetText] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const type = types.find((x) => x.typeTag === tag) ?? types[0] ?? null;

  // The room type's Defaults target fills the Target box until it is typed in; a room with no type uses Other.
  const defaultTarget = defaults.lightTargets?.[room?.roomType ?? 'other'] ?? null;
  const target = targetText ?? (defaultTarget === null ? '' : String(defaultTarget));

  const result = useMemo<Result>(() => {
    if (room === null) return { points: [], note: { key: 'office.ceiling.auto.no_room' } };
    if (mode === 'count') {
      const s = countText.trim();
      return { points: WHOLE.test(s) ? gridByCount(room.ring, Number(s)) : [], note: null };
    }
    if (mode === 'spacing') {
      const r = spacingText.trim() === '' ? null : parseLength(spacingText, 'positive');
      return { points: r?.ok ? gridBySpacing(room.ring, r.inches) : [], note: null };
    }
    if (type === null) return { points: [], note: { key: 'office.ceiling.auto.no_type' } };
    if (type.lumens === null)
      return { points: [], note: { key: 'office.ceiling.auto.set_lumens', vars: { tag: type.typeTag } } };
    if (defaults.cu === null || defaults.llf === null)
      return { points: [], note: { key: 'office.ceiling.auto.set_in_defaults' } };
    const fc = target.trim();
    if (!DECIMAL.test(fc)) return { points: [], note: null };
    const n = lightLevelCount({
      targetFc: Number(fc),
      areaSqFt: room.areaSqFt,
      lumens: type.lumens,
      cu: defaults.cu,
      llf: defaults.llf,
    });
    return { points: n === null ? [] : gridByCount(room.ring, n), note: null };
  }, [room, mode, countText, spacingText, type, defaults.cu, defaults.llf, target]);

  // In an ACT room each can sits at the centre of its tile (EZD-511).
  const points = useMemo(
    () =>
      room === null
        ? []
        : snapPoints(result.points, (p) => snapToActTile(objects, room.level, p, props.actMinShare ?? 0.5)),
    [objects, room, result.points, props.actMinShare],
  );

  const showing = open && canEdit;
  useEffect(() => {
    if (showing) draft.show(points);
    else draft.clear();
  }, [draft, showing, points]);
  // Leaving the Ceiling view (the panel goes away) drops the preview.
  useEffect(() => () => draft.clear(), [draft]);

  const close = () => {
    setOpen(false);
    setTargetText(null);
  };
  const place = () => {
    if (room === null || points.length === 0 || !canEdit) return;
    const changes = placeCans(points, {
      level: room.level,
      status: props.newStatus(),
      newId: props.newId,
      type,
    });
    if (changes === null) return;
    store.applyEdit(changes);
    selection.select(changes.map((c) => c.id));
    close();
  };

  const button = (
    <button
      type="button"
      className={`${parts.lightingButton} ${showing ? parts.lightingOn : ''}`}
      data-testid="auto-layout-cans"
      aria-pressed={showing}
      aria-expanded={showing}
      disabled={!canEdit}
      onClick={() => (showing ? close() : setOpen(true))}
    >
      <Icon name="auto_awesome" size={18} />
      {t('office.ceiling.auto.button')}
    </button>
  );
  if (!showing) return button;

  const field = (
    testId: string,
    label: MessageKey,
    value: string,
    onChange: (v: string) => void,
    unit?: MessageKey,
  ) => (
    <label className={styles.field}>
      <span className={styles.label}>{t(label)}</span>
      <span className={styles.inputRow}>
        <input
          className={styles.input}
          data-testid={testId}
          aria-label={t(label)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit ? <span className={styles.unit}>{t(unit)}</span> : null}
      </span>
    </label>
  );

  return (
    <>
      {button}
      <div className={styles.panel} data-testid="auto-layout-panel">
        <div className={styles.segment} role="group" aria-label={t('office.ceiling.auto.button')}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`auto-layout-mode-${m}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {t(`office.ceiling.auto.mode.${m}`)}
            </button>
          ))}
        </div>
        {types.length > 0 ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('office.ceiling.auto.type')}</span>
            <select
              className={styles.input}
              data-testid="auto-layout-type"
              value={type?.typeTag ?? ''}
              onChange={(e) => setTag(e.target.value)}
            >
              {types.map((x) => (
                <option key={x.typeTag} value={x.typeTag}>
                  {x.typeTag}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === 'count'
          ? field('auto-layout-count', 'office.ceiling.auto.count', countText, setCountText)
          : null}
        {mode === 'spacing'
          ? field('auto-layout-spacing', 'office.ceiling.auto.spacing', spacingText, setSpacingText)
          : null}
        {mode === 'light'
          ? field('auto-layout-target', 'office.ceiling.auto.target', target, setTargetText, 'office.ceiling.auto.fc')
          : null}
        {result.note !== null ? (
          <p className={parts.hint} data-testid="auto-layout-note">
            {t(result.note.key, result.note.vars)}
          </p>
        ) : null}
        <p className={styles.count} data-testid="auto-layout-result">
          {t('office.ceiling.auto.result', { count: points.length })}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            data-testid="auto-layout-cancel"
            onClick={close}
          >
            {t('office.ceiling.auto.cancel')}
          </button>
          <button
            type="button"
            className={styles.primary}
            data-testid="auto-layout-place"
            disabled={points.length === 0}
            onClick={place}
          >
            {t('office.ceiling.auto.place', { count: points.length })}
          </button>
        </div>
      </div>
    </>
  );
}
