'use client';
// EZD-511 (S05 Controls "Acoustical grid ... set direction and start point. Grid auto-balances borders.", "Legend chip
// | Canvas, bottom left | Shows switch zone line style and ACT border sizes for the selected grid."; S05 Data shown
// "ACT grid: module, direction, start point, border sizes"; S05 Validation "warn if the user overrides it"; board
// S05Ceiling legend "Grid balanced: borders {a} and {b}"; Q-0769 built from the written spec in the board's style;
// vault/build/assumptions.md EZD-511 rows): the inspector for one selected ACT grid (Module, Direction, Start point,
// Balance, and the override warning), and the legend chip's border sizes for the selected grid. Without Edit model
// every field is read only. Each change is one edit (one undo step).
import { useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import { ACT_DIRECTIONS, ACT_MODULES, formatLength } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import styles from '../inspector/InspectorPanel.module.css';
import type { ModelStore } from '../model/model-store';
import { actGridEdit, actGridView, type ActGridEdit } from './act-grid-edits';
import own from './ActGridPanel.module.css';

type Store = Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;

/** Lengths as the board writes them: feet and inches to the 1/16". */
export const actLength = (inches: number): string => formatLength(inches, 16);

function useObjects(store: Pick<ModelStore, 'getState' | 'subscribe'>) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
}

function StartField({
  testId,
  label,
  value,
  disabled,
  onText,
}: {
  testId: string;
  label: string;
  value: string;
  disabled: boolean;
  onText: (text: string) => MessageKey | null;
}): ReactElement {
  const t = useT();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<MessageKey | null>(null);
  // A new value resets the draft and the error while rendering (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
    setError(null);
  }
  const commit = () => {
    if (draft === value) {
      setError(null);
      return;
    }
    setError(onText(draft));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setError(null);
    }
  };
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={32}
        aria-invalid={error !== null}
        disabled={disabled}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {error === null ? null : (
        <span className={styles.error} role="alert" data-testid={`${testId}-error`}>
          {t(error)}
        </span>
      )}
    </label>
  );
}

export function ActGridInspector({
  store,
  gridId,
  canEdit,
  minShare = 0.5,
}: {
  store: Store;
  gridId: string;
  canEdit: boolean;
  /** The Defaults "ACT minimum border" as a share of the tile. */
  minShare?: number;
}): ReactElement | null {
  const t = useT();
  const objects = useObjects(store);
  const [refusal, setRefusal] = useState<MessageKey | null>(null);
  const view = actGridView(objects, gridId, minShare);
  if (view === null) return null;
  const apply = (edit: ActGridEdit): MessageKey | null => {
    const r = actGridEdit(store.getState().objects, gridId, edit, minShare);
    if (!r.ok) return r.messageKey;
    if (r.change !== null) store.applyEdit([r.change]);
    return null;
  };
  const pick = (edit: ActGridEdit) => setRefusal(apply(edit));
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="act_grid">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title} data-testid="inspector-title">
            {t('office.ceiling.act.title')}
          </span>
          <span className={styles.subtitle} data-testid="inspector-subtitle">
            {t('office.ceiling.act.subtitle', { module: view.module, room: view.roomName })}
          </span>
        </div>
        {canEdit ? (
          <span className={styles.tag} data-testid="act-grid-status">
            {t(`office.inspector.status.${view.status}`)}
          </span>
        ) : (
          <span className={styles.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      {view.warnings.map((w) => (
        <div
          key={w.direction}
          className={styles.flag}
          role="alert"
          data-testid={`act-grid-warning-${w.direction}`}
        >
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t('office.ceiling.act.warning', { border: actLength(w.border), min: actLength(w.min) })}
          </span>
        </div>
      ))}
      <div className={styles.section}>
        <div className={styles.grid2}>
          <label className={styles.field}>
            {t('office.ceiling.act.module')}
            <select
              className={styles.select}
              data-testid="act-grid-module"
              value={view.module}
              disabled={!canEdit}
              onChange={(e) => {
                const v = ACT_MODULES.find((m) => m === e.target.value);
                if (v !== undefined) pick({ field: 'module', value: v });
              }}
            >
              {ACT_MODULES.map((m) => (
                <option key={m} value={m}>
                  {t(`office.ceiling.act.module.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            {t('office.ceiling.act.direction')}
            <select
              className={styles.select}
              data-testid="act-grid-direction"
              value={view.direction}
              disabled={!canEdit}
              onChange={(e) => {
                const v = ACT_DIRECTIONS.find((d) => d === e.target.value);
                if (v !== undefined) pick({ field: 'direction', value: v });
              }}
            >
              {ACT_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`office.ceiling.act.direction.${d}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className={own.label}>{t('office.ceiling.act.start')}</span>
        <div className={styles.grid2}>
          <StartField
            testId="act-grid-start-along"
            label={t('office.ceiling.act.start.along_main')}
            value={actLength(view.start[0])}
            disabled={!canEdit}
            onText={(text) => apply({ field: 'start', direction: 'along_main', text })}
          />
          <StartField
            testId="act-grid-start-across"
            label={t('office.ceiling.act.start.across_mains')}
            value={actLength(view.start[1])}
            disabled={!canEdit}
            onText={(text) => apply({ field: 'start', direction: 'across_mains', text })}
          />
        </div>
        <p className={styles.hint} data-testid="act-grid-borders">
          {t(view.balanced ? 'office.ceiling.legend.act_balanced' : 'office.ceiling.legend.act_borders', {
            a: actLength(view.borders[0]),
            b: actLength(view.borders[1]),
          })}
        </p>
        {view.balanced ? null : (
          <button
            type="button"
            className={own.button}
            data-testid="act-grid-balance"
            disabled={!canEdit}
            onClick={() => pick({ field: 'balance' })}
          >
            {t('office.ceiling.act.balance')}
          </button>
        )}
        {refusal === null ? null : (
          <span className={styles.error} role="alert" data-testid="act-grid-error">
            {t(refusal)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The legend chip's ACT part (S05 "ACT border sizes for the selected grid"): shown while one ACT grid is selected,
 * "Grid balanced: borders {a} and {b}" (board) or, after an override, "Grid borders {a} and {b}".
 */
export function ActLegend({
  store,
  selection,
  minShare = 0.5,
}: {
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  selection: { subscribe(listener: () => void): () => void; getUi(): { ids: readonly string[] } };
  minShare?: number;
}): ReactElement | null {
  const t = useT();
  const objects = useObjects(store);
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const id = ui.ids.length === 1 ? ui.ids[0]! : null;
  const view = id === null ? null : actGridView(objects, id, minShare);
  if (view === null) return null;
  return (
    <span className={own.legend} data-testid="legend-act-borders">
      {t(view.balanced ? 'office.ceiling.legend.act_balanced' : 'office.ceiling.legend.act_borders', {
        a: actLength(view.borders[0]),
        b: actLength(view.borders[1]),
      })}
    </span>
  );
}
