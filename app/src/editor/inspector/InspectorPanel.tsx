'use client';
// EZD-213b Build step 6 (vault/plans/EZD-213b.md section 1, Decided "D-Panel state", "D-Edit layers", "D-Commit",
// "D-Length field", "D-Controls", "D-Layout", "D-Text", "D-View only", "D-Empty", "D-Tiles", "D-Focus Length";
// boards S03dWallSelected, S03dDoorSelected, S03dWindowSelected, S03dStates; S03 Controls — inspector; 04 Left panel
// and inspector; 05 Q-0630 rows 9, 33, 36; Q-0633 G7, G9, G11; Q-0635; Q-0640 row 5-4; Q-0645 (a)): the inspector
// panel for walls, doors, windows and bulk selections. `InspectorContent` takes no store, so static markup renders it.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  IMPACT_RATINGS,
  SHUTTER_TYPES,
  WALL_MATERIALS,
  type ImpactRating,
  type ShutterType,
  type WallLayer,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useCoarsePointer } from '../../lib/device/useDeviceLayout';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import type { DrawingController } from '../tools/drawing-controller';
import { gapSection } from '../tools/gap';
import { newObjectId } from '../tools/model-changes';
import type { InspectorEdit } from './inspector-edits';
import {
  commitInspectorEdits,
  layerEdit,
  layerMaterialEdit,
  lengthEdit,
  roughOpeningEdit,
  type TextField,
} from './inspector-input';
import {
  inspectorView,
  type BulkOpeningFields,
  type BulkWallFields,
  type DoorView,
  type HingeLabel,
  type InspectorView,
  type LayerRow,
  type Shared,
  type SideLabel,
} from './inspector-view';
import { ResolveGap, type ResolveGapProps } from './ResolveGap';
import styles from './InspectorPanel.module.css';

// D-Text: sub-line and view-only layer parts are joined by this constant.
const SEPARATOR = ' · ';

// D-Length field: `MAX_TEXT_LENGTH` of G/length.ts; a rough opening is two lengths and its sign.
const MAX_TEXT_LENGTH = 32;
const MAX_ROUGH_OPENING_LENGTH = 65;

type TFn = ReturnType<typeof useT>;

type WallView = Extract<InspectorView, { kind: 'wall' }>;
type OpeningView = Extract<InspectorView, { kind: 'opening' }>;
type BulkView = Extract<InspectorView, { kind: 'bulk' }>;

export type InspectorPanelProps = {
  store: ModelStore;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'onDoubleClick'>;
  canEdit: boolean;
  // EZD-213c D-Panel: the gap state and its two actions.
  drawing: Pick<DrawingController, 'getUi' | 'subscribe' | 'startPick' | 'keep'> | null;
};

export type InspectorContentProps = {
  view: InspectorView;
  canEdit: boolean;
  coarse: boolean;
  layersEditing: boolean;
  onToggleLayers: () => void;
  onCommit: (edits: readonly InspectorEdit[]) => MessageKey | null;
  onLayerMaterial: (index: number, material: WallLayer['material']) => MessageKey | null;
  lengthRef?: Ref<HTMLInputElement>;
  // EZD-213c D-Place: the Resolve the gap section, last in the wall view.
  gap?: ResolveGapProps | null;
};

// EZD-213c D-Panel: no drawing controller, nothing to subscribe to.
const noSubscribe = () => () => {};

export function InspectorPanel({
  store,
  selection,
  canEdit,
  drawing,
}: InspectorPanelProps): ReactElement {
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const coarse = useCoarsePointer();
  const level = openFloorId(objects);
  const view = useMemo<InspectorView>(
    () =>
      level === null || ui.ids.length === 0
        ? { kind: 'empty' }
        : inspectorView(objects, level, ui.ids),
    [objects, level, ui.ids],
  );
  const idsKey = ui.ids.join(' ');

  // EZD-213c D-Panel: the gap of the one selected wall.
  const drawingUi = useSyncExternalStore(
    drawing ? drawing.subscribe : noSubscribe,
    () => drawing?.getUi() ?? null,
    () => drawing?.getUi() ?? null,
  );
  const state = view.kind === 'wall' && drawingUi !== null ? gapSection(drawingUi, view.id) : null;
  const gap: ResolveGapProps | null =
    state === null || drawing === null
      ? null
      : {
          box: state.box,
          picking: state.picking,
          alert: state.alert,
          coarse,
          onPick: () => drawing.startPick(state.box.wallIds),
          onKeep: () => drawing.keep(state.box.wallIds),
        };

  // D-Edit layers.
  // Reset on a selection change while rendering, not in an effect (react-hooks/set-state-in-effect).
  const [layersFor, setLayersFor] = useState<string | null>(null);
  const [layersIds, setLayersIds] = useState(idsKey);
  if (layersIds !== idsKey) {
    setLayersIds(idsKey);
    setLayersFor(null);
  }
  const layersEditing = layersFor === idsKey && view.kind === 'wall' && canEdit;
  const onToggleLayers = useCallback(
    () => setLayersFor((f) => (f === idsKey ? null : idsKey)),
    [idsKey],
  );

  // D-Commit.
  const onCommit = useCallback(
    (edits: readonly InspectorEdit[]): MessageKey | null => {
      const r = commitInspectorEdits({ store, ids: ui.ids, newId: newObjectId }, edits);
      return r.ok ? null : r.messageKey;
    },
    [store, ui.ids],
  );
  const onLayerMaterial = useCallback(
    (index: number, material: WallLayer['material']): MessageKey | null => {
      if (level === null || view.kind !== 'wall') return null;
      const e = layerMaterialEdit(objects, level, view.id, index, material);
      if (e === null) return null;
      return onCommit([e]);
    },
    [objects, level, view, onCommit],
  );

  // D-Focus Length.
  const lengthRef = useRef<HTMLInputElement>(null);
  // Each double-click is handled once: the handled count is kept in a ref, not set back in the effect.
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusDone = useRef(0);
  useEffect(
    () => selection.onDoubleClick((id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))),
    [selection],
  );
  useEffect(() => {
    if (focus === null || focus.n === focusDone.current) return;
    focusDone.current = focus.n;
    const input = lengthRef.current;
    if (view.kind === 'wall' && view.id.toLowerCase() === focus.id.toLowerCase() && input) {
      input.focus();
      input.select();
    }
  }, [focus, view]);

  return (
    <InspectorContent
      key={idsKey}
      view={view}
      canEdit={canEdit}
      coarse={coarse}
      layersEditing={layersEditing}
      onToggleLayers={onToggleLayers}
      onCommit={onCommit}
      onLayerMaterial={onLayerMaterial}
      lengthRef={lengthRef}
      gap={gap}
    />
  );
}

export function InspectorContent(props: InspectorContentProps): ReactElement {
  const { view } = props;
  const t = useT();
  if (view.kind === 'empty') {
    return (
      <div className={styles.panel} data-testid="inspector" data-inspector-kind="empty">
        <div className={styles.empty} data-testid="inspector-empty">
          <span className={styles.emptyIcon}>
            <Icon name="arrow_selector_tool" size={30} />
          </span>
          <span className={styles.emptyText}>{t('office.inspector.empty')}</span>
          <span className={styles.hint} data-testid="inspector-empty-hint">
            {t(props.coarse ? 'office.inspector.empty_hint_touch' : 'office.inspector.empty_hint')}
          </span>
        </div>
      </div>
    );
  }
  if (view.kind === 'wall') return <WallPanel {...props} view={view} />;
  if (view.kind === 'opening') return <OpeningPanel {...props} view={view} />;
  return <BulkPanel {...props} view={view} />;
}

// ---- Shared pieces ----

type ControlError = { testId: string; key: MessageKey } | null;

// D-Controls: one refusal at a time under its control, cleared by the next commit.
function useControlCommit(onCommit: InspectorContentProps['onCommit']) {
  const [error, setError] = useState<ControlError>(null);
  const run = useCallback((testId: string, result: () => MessageKey | null) => {
    const key = result();
    setError(key === null ? null : { testId, key });
  }, []);
  const commit = useCallback(
    (testId: string, edits: readonly InspectorEdit[]) => run(testId, () => onCommit(edits)),
    [onCommit, run],
  );
  return { error, run, commit };
}

function ControlErrorLine({ error, testId }: { error: ControlError; testId: string }) {
  const t = useT();
  if (error === null || error.testId !== testId) return null;
  return (
    <p className={styles.error} role="alert" data-testid={`${testId}-error`}>
      {t(error.key)}
    </p>
  );
}

function Header({
  title,
  subtitle,
  canEdit,
}: {
  title: string;
  subtitle: string;
  canEdit: boolean;
}) {
  const t = useT();
  return (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <span className={styles.title} data-testid="inspector-title">
          {title}
        </span>
        <span className={styles.subtitle} data-testid="inspector-subtitle">
          {subtitle}
        </span>
      </div>
      {canEdit ? null : (
        <span className={styles.badge} data-testid="inspector-view-only">
          <Icon name="visibility" size={14} />
          {t('office.inspector.view_only')}
        </span>
      )}
    </div>
  );
}

// D-Length field.
function LengthField({
  testId,
  label,
  value,
  mixed,
  onText,
  inputRef,
  maxLength,
}: {
  testId: string;
  label: string;
  value: string;
  mixed: boolean;
  onText: (text: string) => MessageKey | null;
  inputRef?: Ref<HTMLInputElement>;
  maxLength: number;
}) {
  const t = useT();
  const start = mixed ? '' : value;
  const [draft, setDraft] = useState(start);
  const [error, setError] = useState<MessageKey | null>(null);
  // A new value resets the draft and the error while rendering (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState(start);
  if (shown !== start) {
    setShown(start);
    setDraft(start);
    setError(null);
  }

  const commit = () => {
    if (draft === start) {
      setError(null);
      return;
    }
    const key = onText(draft);
    if (key === null) {
      setDraft(start);
      setError(null);
    } else {
      setError(key);
    }
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(start);
      setError(null);
    }
  };
  return (
    <>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={error !== null}
        placeholder={mixed ? t('office.inspector.mixed') : undefined}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {error === null ? null : (
        <p className={styles.error} role="alert" data-testid={`${testId}-error`}>
          {t(error)}
        </p>
      )}
    </>
  );
}

const lengthText =
  (field: TextField, onCommit: InspectorContentProps['onCommit']) =>
  (text: string): MessageKey | null => {
    const p = lengthEdit(field, text);
    return p.ok ? onCommit([p.edit]) : p.messageKey;
  };

const roughText =
  (onCommit: InspectorContentProps['onCommit']) =>
  (text: string): MessageKey | null => {
    const p = roughOpeningEdit(text);
    return p.ok ? onCommit([p.edit]) : p.messageKey;
  };

// A labelled length: an input when editing, plain text (D-View only) otherwise.
function TextBox({
  testId,
  label,
  shared,
  canEdit,
  onText,
  inputRef,
  maxLength = MAX_TEXT_LENGTH,
  head = false,
}: {
  testId: string;
  label: string;
  shared: Shared<string>;
  canEdit: boolean;
  onText: (text: string) => MessageKey | null;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  head?: boolean;
}) {
  const t = useT();
  return (
    <div className={styles.field}>
      <span className={head ? styles.head : undefined}>{label}</span>
      {canEdit ? (
        <LengthField
          testId={testId}
          label={label}
          value={shared.mixed ? '' : shared.value}
          mixed={shared.mixed}
          onText={onText}
          inputRef={inputRef}
          maxLength={maxLength}
        />
      ) : (
        <span className={styles.plain} data-testid={testId}>
          {shared.mixed ? t('office.inspector.mixed') : shared.value}
        </span>
      )}
    </div>
  );
}

const one = <T,>(value: T): Shared<T> => ({ mixed: false, value });

function statusDot(status: WallView['fields']['status']): string {
  if (status === 'demo') return styles.dotDemo!;
  if (status === 'new') return styles.dotNew!;
  return styles.dotExisting!;
}

function sideText(t: TFn, l: SideLabel): string {
  if (l.kind === 'room') return t('office.inspector.side.room', { name: l.name });
  if (l.kind === 'outside') return t('office.inspector.side.outside');
  return t(`office.inspector.side.${l.direction}`);
}

function opensText(t: TFn, l: SideLabel): string {
  if (l.kind === 'room') return t('office.inspector.opens.room', { name: l.name });
  if (l.kind === 'outside') return t('office.inspector.opens.outside');
  return t(`office.inspector.opens.${l.direction}`);
}

const hingeOn = (t: TFn, h: HingeLabel) => t(`office.inspector.hinge_on.${h}`);

function wallTitle(t: TFn, number: number | null): string {
  return number === null
    ? t('office.conflicts.object.wall_unnumbered')
    : t('office.conflicts.object.wall', { number });
}

function layerRowsReadOnly(t: TFn, rows: readonly LayerRow[]): ReactNode {
  return rows.map((r, i) => (
    <div key={i} className={styles.row} data-testid={`inspector-layer-${i}`}>
      <span data-testid={`inspector-layer-${i}-material`}>
        {t(`office.inspector.material.${r.material}`)}
      </span>{' '}
      <span className={styles.mono} data-testid={`inspector-layer-${i}-thickness`}>
        {r.thickness}
      </span>
    </div>
  ));
}

function layerLine(t: TFn, rows: readonly LayerRow[]): string {
  return rows
    .map((r) =>
      t('office.inspector.layer_value', {
        material: t(`office.inspector.material.${r.material}`),
        thickness: r.thickness,
      }),
    )
    .join(SEPARATOR);
}

function ImpactSection({
  impact,
  shutter,
  canEdit,
  commit,
  error,
}: {
  impact: Shared<ImpactRating>;
  shutter: Shared<ShutterType | null>;
  canEdit: boolean;
  commit: (testId: string, edits: readonly InspectorEdit[]) => void;
  error: ControlError;
}) {
  const t = useT();
  const isShutter = !impact.mixed && impact.value === 'shutter';
  if (!canEdit) {
    return (
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.impact')}</span>
        <span className={styles.plain} data-testid="inspector-impact">
          {impact.mixed
            ? t('office.inspector.mixed')
            : t(`office.inspector.impact.${impact.value}`)}
        </span>
        {isShutter && (shutter.mixed || shutter.value !== null) ? (
          <div className={styles.field}>
            <span>{t('office.inspector.field.shutter_type')}</span>
            <span className={styles.plain} data-testid="inspector-shutter-type">
              {shutter.mixed
                ? t('office.inspector.mixed')
                : t(`office.inspector.shutter.${shutter.value!}`)}
            </span>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.section}>
      <span className={styles.head}>{t('office.inspector.field.impact')}</span>
      <div
        className={styles.segments}
        role="radiogroup"
        aria-label={t('office.inspector.field.impact')}
        data-testid="inspector-impact"
      >
        {IMPACT_RATINGS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={!impact.mixed && impact.value === v}
            className={styles.segment}
            data-testid={`inspector-impact-${v}`}
            onClick={() => {
              if (!impact.mixed && impact.value === v) return;
              commit('inspector-impact', [{ field: 'impactRating', value: v }]);
            }}
          >
            {t(`office.inspector.impact.${v}`)}
          </button>
        ))}
      </div>
      {impact.mixed ? (
        <span className={`${styles.hint} ${styles.mixed}`} data-testid="inspector-impact-mixed">
          {t('office.inspector.mixed')}
        </span>
      ) : null}
      <ControlErrorLine error={error} testId="inspector-impact" />
      {isShutter ? (
        <label className={styles.field}>
          {t('office.inspector.field.shutter_type')}
          <select
            className={styles.select}
            data-testid="inspector-shutter-type"
            value={shutter.mixed || shutter.value === null ? '' : shutter.value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') return;
              commit('inspector-shutter-type', [{ field: 'shutterType', value: v as ShutterType }]);
            }}
          >
            <option value="">{t('office.inspector.shutter_none')}</option>
            {SHUTTER_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`office.inspector.shutter.${s}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ControlErrorLine error={error} testId="inspector-shutter-type" />
    </div>
  );
}

// ---- Wall (board W) ----

function WallPanel(props: InspectorContentProps & { view: WallView }) {
  const { view, canEdit, onCommit } = props;
  const t = useT();
  const f = view.fields;
  const { error, run, commit } = useControlCommit(onCommit);
  const title =
    view.number === null
      ? t('office.conflicts.object.wall_unnumbered')
      : t('office.conflicts.object.wall', { number: view.number });
  const subtitle =
    view.rooms.length > 0 ? view.rooms.join(SEPARATOR) : t('office.inspector.no_room');
  const editing = props.layersEditing && canEdit;
  const status = t(`office.inspector.status.${f.status}`);

  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="wall">
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      <div className={styles.grid3}>
        <TextBox
          testId="inspector-length"
          label={t('office.inspector.field.length')}
          shared={one(f.length)}
          canEdit={canEdit}
          onText={lengthText('wallLength', onCommit)}
          inputRef={props.lengthRef}
        />
        <TextBox
          testId="inspector-thickness"
          label={t('office.inspector.field.thickness')}
          shared={one(f.thickness)}
          canEdit={canEdit}
          onText={lengthText('wallThickness', onCommit)}
        />
        <TextBox
          testId="inspector-height"
          label={t('office.inspector.field.height')}
          shared={one(f.height)}
          canEdit={canEdit}
          onText={lengthText('wallHeight', onCommit)}
        />
      </div>
      {canEdit ? (
        <>
          <div className={styles.section}>
            <div className={styles.headRow}>
              <span className={styles.head}>{t('office.inspector.field.layers')}</span>
              <button
                type="button"
                className={styles.small}
                aria-pressed={editing}
                data-testid="inspector-edit-layers"
                onClick={props.onToggleLayers}
              >
                {t('office.inspector.field.edit_layers')}
              </button>
            </div>
            <div className={styles.layers} data-testid="inspector-layers">
              {editing
                ? f.layers.map((r, i) => (
                    <div key={i} className={styles.row} data-testid={`inspector-layer-${i}`}>
                      <select
                        className={styles.select}
                        aria-label={t('office.inspector.field.layers')}
                        data-testid={`inspector-layer-${i}-material`}
                        value={r.material}
                        onChange={(e) =>
                          run(`inspector-layer-${i}`, () =>
                            props.onLayerMaterial(i, e.target.value as WallLayer['material']),
                          )
                        }
                      >
                        {WALL_MATERIALS.map((m) => (
                          <option key={m} value={m}>
                            {t(`office.inspector.material.${m}`)}
                          </option>
                        ))}
                      </select>
                      <LengthField
                        testId={`inspector-layer-${i}-thickness`}
                        label={t(`office.inspector.material.${r.material}`)}
                        value={r.thickness}
                        mixed={false}
                        onText={(text) => {
                          const p = layerEdit(i, r.material, text);
                          return p.ok ? onCommit([p.edit]) : p.messageKey;
                        }}
                        maxLength={MAX_TEXT_LENGTH}
                      />
                      <ControlErrorLine error={error} testId={`inspector-layer-${i}`} />
                    </div>
                  ))
                : layerRowsReadOnly(t, f.layers)}
              <div className={`${styles.row} ${styles.total}`} data-testid="inspector-layers-total">
                <span>{t('office.inspector.field.total')}</span>{' '}
                <span className={styles.mono}>{f.total}</span>
              </div>
            </div>
          </div>
          <div className={styles.section}>
            <div className={styles.field}>
              <span>{t('office.inspector.field.status')}</span>
              <span
                className={styles.readOnly}
                aria-label={t('office.inspector.status_read_only')}
                data-testid="inspector-status"
              >
                <span className={`${styles.dot} ${statusDot(f.status)}`} />
                {status}
                <span className={styles.readOnlyLock}>
                  <Icon name="lock" size={16} />
                </span>
              </span>
            </div>
          </div>
          <div className={styles.section}>
            <label className={styles.check}>
              <input
                type="checkbox"
                data-testid="inspector-bearing"
                checked={f.bearing}
                onChange={(e) =>
                  commit('inspector-bearing', [{ field: 'wallBearing', value: e.target.checked }])
                }
              />
              {t('office.inspector.field.bearing')}
            </label>
            <ControlErrorLine error={error} testId="inspector-bearing" />
          </div>
        </>
      ) : (
        <>
          <div className={styles.section}>
            <span className={styles.head}>{t('office.inspector.field.layers')}</span>
            <span className={styles.layerLine} data-testid="inspector-layers">
              {layerLine(t, f.layers)}
            </span>
          </div>
          <div className={`${styles.section} ${styles.side}`}>
            <div className={styles.field}>
              <span>{t('office.inspector.field.status')}</span>
              <span className={styles.plain} data-testid="inspector-status">
                {status}
              </span>
            </div>
            <div className={styles.field}>
              <span>{t('office.inspector.field.bearing')}</span>
              <span className={styles.plain} data-testid="inspector-bearing">
                {t(f.bearing ? 'office.inspector.yes' : 'office.inspector.no')}
              </span>
            </div>
          </div>
        </>
      )}
      {props.gap != null ? <ResolveGap {...props.gap} /> : null}
    </div>
  );
}

// ---- Door and window (boards D, N, S) ----

const TILES: Record<'left' | 'right', Record<'left' | 'right', ReactElement>> = {
  left: {
    left: (
      <svg viewBox="-4 -14 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="18" y1="30" x2="18" y2="-10" className={styles.tileLeaf} />
        <path d="M58 30 A40 40 0 0 0 18 -10" className={styles.tileArc} />
        <circle cx="18" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
    right: (
      <svg viewBox="-4 -14 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="58" y1="30" x2="58" y2="-10" className={styles.tileLeaf} />
        <path d="M18 30 A40 40 0 0 1 58 -10" className={styles.tileArc} />
        <circle cx="58" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
  },
  right: {
    left: (
      <svg viewBox="-4 26 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="18" y1="38" x2="18" y2="78" className={styles.tileLeaf} />
        <path d="M58 38 A40 40 0 0 1 18 78" className={styles.tileArc} />
        <circle cx="18" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
    right: (
      <svg viewBox="-4 26 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="58" y1="38" x2="58" y2="78" className={styles.tileLeaf} />
        <path d="M18 38 A40 40 0 0 0 58 78" className={styles.tileArc} />
        <circle cx="58" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
  },
};

const SIDES = ['left', 'right'] as const;

function SwingSection({
  door,
  canEdit,
  commit,
  error,
}: {
  door: DoorView;
  canEdit: boolean;
  commit: (testId: string, edits: readonly InspectorEdit[]) => void;
  error: ControlError;
}) {
  const t = useT();
  const result = t('office.inspector.door_result', {
    opens: opensText(t, door.result.opensInto),
    hinge: hingeOn(t, door.result.hinge),
  });
  const resultLine = (
    <span className={styles.result} data-testid="inspector-door-result">
      {result}
    </span>
  );
  if (!canEdit) {
    return (
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.swing_hand')}</span>
        {resultLine}
      </div>
    );
  }
  const press = (s: 'left' | 'right', h: 'left' | 'right') => {
    const edits: InspectorEdit[] = [];
    if (s !== door.swing) edits.push({ field: 'swing', value: s });
    if (h !== door.hand) edits.push({ field: 'hand', value: h });
    if (edits.length === 0) return;
    commit('inspector-swing-hand', edits);
  };
  return (
    <div className={styles.section}>
      <span className={styles.head}>{t('office.inspector.field.swing_hand')}</span>
      <div
        className={styles.swing}
        role="radiogroup"
        aria-label={t('office.inspector.field.swing_hand')}
        data-testid="inspector-swing-hand"
      >
        <span />
        {SIDES.map((h) => (
          <span
            key={h}
            className={`${styles.hint} ${styles.center}`}
            data-testid={`inspector-hinge-${h}`}
          >
            {t(`office.inspector.hinge.${door.hingeLabels[h]}`)}
          </span>
        ))}
        {SIDES.map((s) => [
          <span key={`side-${s}`} className={styles.hint} data-testid={`inspector-swing-${s}`}>
            {sideText(t, door.swingLabels[s])}
          </span>,
          ...SIDES.map((h) => (
            <button
              key={`${s}-${h}`}
              type="button"
              role="radio"
              className={styles.tile}
              aria-checked={door.swing === s && door.hand === h}
              aria-label={t('office.inspector.door_tile', {
                opens: opensText(t, door.swingLabels[s]),
                hinge: hingeOn(t, door.hingeLabels[h]),
              })}
              data-testid={`inspector-tile-${s}-${h}`}
              onClick={() => press(s, h)}
            >
              {TILES[s][h]}
            </button>
          )),
        ])}
      </div>
      <ControlErrorLine error={error} testId="inspector-swing-hand" />
      {resultLine}
      <span className={styles.hint} data-testid="inspector-door-hint">
        {t('office.inspector.door_hint')}
      </span>
    </div>
  );
}

function OpeningPanel(props: InspectorContentProps & { view: OpeningView }) {
  const { view, canEdit, onCommit } = props;
  const t = useT();
  const f = view.fields;
  const { error, commit } = useControlCommit(onCommit);
  const number = view.number;
  const title =
    number === null
      ? t(`office.conflicts.object.${view.openingKind}_unnumbered`)
      : t(`office.conflicts.object.${view.openingKind}`, { number });
  const subtitle =
    view.host === null
      ? t('office.inspector.not_on_wall')
      : [...view.rooms, wallTitle(t, view.host.number)].join(SEPARATOR);
  const flagged = view.host === null;
  const ro = t('office.inspector.rough_opening_value', {
    width: f.roughOpening.width,
    height: f.roughOpening.height,
  });

  return (
    <div
      className={styles.panel}
      data-testid="inspector"
      data-inspector-kind="opening"
      data-opening-kind={view.openingKind}
    >
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      {flagged ? (
        <div className={styles.flag} data-testid="inspector-not-on-wall">
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t('office.inspector.not_on_wall')}
          </span>
          {canEdit ? (
            <span className={`${styles.hint} ${styles.flagHint}`}>
              {t('office.inspector.not_on_wall_hint')}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={`${styles.section} ${styles.first} ${flagged ? '' : styles.flush}`}>
        <span className={styles.head}>{t('office.inspector.field.size')}</span>
        <div className={styles.pair}>
          <TextBox
            testId="inspector-width"
            label={t('office.inspector.field.width')}
            shared={one(f.width)}
            canEdit={canEdit}
            onText={lengthText('openingWidth', onCommit)}
          />
          <TextBox
            testId="inspector-opening-height"
            label={t('office.inspector.field.height')}
            shared={one(f.height)}
            canEdit={canEdit}
            onText={lengthText('openingHeight', onCommit)}
          />
        </div>
      </div>
      {view.door !== null ? (
        <SwingSection door={view.door} canEdit={canEdit} commit={commit} error={error} />
      ) : null}
      {view.offset !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-offset"
            label={t('office.inspector.field.offset')}
            shared={one(view.offset.left)}
            canEdit={canEdit}
            onText={lengthText('offsetLeft', onCommit)}
            head
          />
          <span className={styles.hint} data-testid="inspector-offset-caption">
            {view.offset.cornerWall === null
              ? t('office.inspector.offset.free_end')
              : view.offset.cornerWall.number === null
                ? t('office.inspector.offset.corner_unnumbered')
                : t('office.inspector.offset.corner', { number: view.offset.cornerWall.number })}
          </span>
        </div>
      ) : null}
      {f.sillHeight !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-sill"
            label={t('office.inspector.field.sill')}
            shared={one(f.sillHeight)}
            canEdit={canEdit}
            onText={lengthText('sillHeight', onCommit)}
            head
          />
        </div>
      ) : null}
      <RoughOpeningSection
        shared={one(ro)}
        auto={f.roughOpeningAuto}
        canEdit={canEdit}
        onCommit={onCommit}
      />
      <ImpactSection
        impact={one(f.impactRating)}
        shutter={one(f.shutterType)}
        canEdit={canEdit}
        commit={commit}
        error={error}
      />
    </div>
  );
}

function RoughOpeningSection({
  shared,
  auto,
  canEdit,
  onCommit,
}: {
  shared: Shared<string>;
  auto: boolean;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const label = t('office.inspector.field.rough_opening');
  return (
    <div className={styles.section}>
      <div className={styles.headRowCenter}>
        <span className={styles.head}>{label}</span>
        {auto ? (
          <span className={styles.tag} data-testid="inspector-rough-opening-auto">
            {t('office.inspector.auto')}
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <LengthField
          testId="inspector-rough-opening"
          label={label}
          value={shared.mixed ? '' : shared.value}
          mixed={shared.mixed}
          onText={roughText(onCommit)}
          maxLength={MAX_ROUGH_OPENING_LENGTH}
        />
      ) : (
        <span className={styles.plain} data-testid="inspector-rough-opening">
          {shared.mixed ? t('office.inspector.mixed') : shared.value}
        </span>
      )}
    </div>
  );
}

// ---- Bulk (board S) ----

function BulkPanel(props: InspectorContentProps & { view: BulkView }) {
  const { view, canEdit } = props;
  const t = useT();
  const title = t(`office.inspector.bulk_title.${view.noun}`, { count: view.count });
  const subtitle = t('office.inspector.bulk_subtitle', { count: view.count });
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="bulk">
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      {view.walls !== null ? (
        <BulkWalls walls={view.walls} canEdit={canEdit} onCommit={props.onCommit} />
      ) : null}
      {view.openings !== null ? (
        <BulkOpenings openings={view.openings} canEdit={canEdit} onCommit={props.onCommit} />
      ) : null}
    </div>
  );
}

function BulkWalls({
  walls,
  canEdit,
  onCommit,
}: {
  walls: BulkWallFields;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const { error, commit } = useControlCommit(onCommit);
  const mixed = t('office.inspector.mixed');
  const bearing = walls.bearing;
  return (
    <>
      <div className={styles.grid2}>
        <TextBox
          testId="inspector-thickness"
          label={t('office.inspector.field.thickness')}
          shared={walls.thickness}
          canEdit={canEdit}
          onText={lengthText('wallThickness', onCommit)}
        />
        <TextBox
          testId="inspector-height"
          label={t('office.inspector.field.height')}
          shared={walls.height}
          canEdit={canEdit}
          onText={lengthText('wallHeight', onCommit)}
        />
      </div>
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.layers')}</span>
        {walls.layers.mixed ? (
          <span
            className={`${styles.readOnly} ${styles.readOnlyMixed}`}
            data-testid="inspector-layers-mixed"
          >
            {mixed}
          </span>
        ) : canEdit ? (
          <div className={styles.layers} data-testid="inspector-layers">
            {layerRowsReadOnly(t, walls.layers.value)}
          </div>
        ) : (
          <span className={styles.layerLine} data-testid="inspector-layers">
            {layerLine(t, walls.layers.value)}
          </span>
        )}
      </div>
      {canEdit ? (
        <div className={styles.section}>
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="inspector-bearing"
              aria-label={bearing.mixed ? t('office.inspector.bearing_mixed') : undefined}
              checked={bearing.mixed ? false : bearing.value}
              onChange={(e) =>
                commit('inspector-bearing', [{ field: 'wallBearing', value: e.target.checked }])
              }
            />
            {t('office.inspector.field.bearing')}
            {bearing.mixed ? (
              <span
                className={`${styles.hint} ${styles.mixed}`}
                data-testid="inspector-bearing-mixed"
              >
                {mixed}
              </span>
            ) : null}
          </label>
          <ControlErrorLine error={error} testId="inspector-bearing" />
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.field}>
            <span>{t('office.inspector.field.bearing')}</span>
            <span className={styles.plain} data-testid="inspector-bearing">
              {bearing.mixed
                ? mixed
                : t(bearing.value ? 'office.inspector.yes' : 'office.inspector.no')}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function BulkOpenings({
  openings,
  canEdit,
  onCommit,
}: {
  openings: BulkOpeningFields;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const { error, commit } = useControlCommit(onCommit);
  const ro: Shared<string> = openings.roughOpening.mixed
    ? { mixed: true }
    : one(t('office.inspector.rough_opening_value', openings.roughOpening.value));
  return (
    <>
      <div className={`${styles.section} ${styles.first} ${styles.flush}`}>
        <span className={styles.head}>{t('office.inspector.field.size')}</span>
        <div className={styles.pair}>
          <TextBox
            testId="inspector-width"
            label={t('office.inspector.field.width')}
            shared={openings.width}
            canEdit={canEdit}
            onText={lengthText('openingWidth', onCommit)}
          />
          <TextBox
            testId="inspector-opening-height"
            label={t('office.inspector.field.height')}
            shared={openings.height}
            canEdit={canEdit}
            onText={lengthText('openingHeight', onCommit)}
          />
        </div>
      </div>
      {openings.sillHeight !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-sill"
            label={t('office.inspector.field.sill')}
            shared={openings.sillHeight}
            canEdit={canEdit}
            onText={lengthText('sillHeight', onCommit)}
            head
          />
        </div>
      ) : null}
      <RoughOpeningSection shared={ro} auto={false} canEdit={canEdit} onCommit={onCommit} />
      <ImpactSection
        impact={openings.impactRating}
        shutter={openings.shutterType}
        canEdit={canEdit}
        commit={commit}
        error={error}
      />
    </>
  );
}
