'use client';

// EZD-222 (S15d Keyboard shortcuts table, Reset to default map, Reset shortcut (row); phase-02.md EZD-222 "Already
// used by check, browser keys refused"): the Keyboard shortcuts table on Settings > Defaults. One row per command:
// click the key cell, press the new key (Esc cancels). A key another command uses in the same view is refused with
// "Already used by <command> in <view> · not saved", and a key the browser keeps is refused. The value edited is
// the owner's changes to the default map; it is saved with the rest of the page. Board S15dDefaults: the subtitle
// with the command count, the All / Plan / 3D / Sheets / Render filter and the note under the table.
import { useState, type KeyboardEvent } from 'react';
import {
  SHORTCUT_COMMANDS,
  SHORTCUT_VIEWS,
  effectiveBindings,
  keyLabel,
  keyOfEvent,
  overridesOf,
  refuseKey,
  resetToDefaultMap,
  sharedView,
  usedBy,
  type ShortcutBindings,
  type ShortcutView,
} from '../../../lib/defaults/shortcuts';
import type { ShortcutMap } from '../../../lib/defaults/registry';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import styles from './ShortcutsTable.module.css';

// The header tabs' names (components/shell/editor-views.ts).
const VIEW_LABEL: Record<ShortcutView, MessageKey> = {
  plan: 'office.header.view.plan',
  '3d': 'office.header.view.3d',
  sheets: 'office.header.view.sheets',
  render: 'office.header.view.render',
};

export function ShortcutsTable({
  value,
  onChange,
  readOnly,
  query,
  error,
}: {
  value: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
  readOnly: boolean;
  query: string;
  error: MessageKey | undefined;
}) {
  const t = useT();
  const [listening, setListening] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ id: string; text: string } | null>(null);
  // Board S15dDefaults: All, or the commands of one view.
  const [view, setView] = useState<ShortcutView | null>(null);
  const bindings: ShortcutBindings = effectiveBindings(value);
  const title = t('office.defaults.group.keyboard_shortcuts');
  const q = query.trim().toLowerCase();
  const found =
    q === '' || title.toLowerCase().includes(q)
      ? SHORTCUT_COMMANDS
      : SHORTCUT_COMMANDS.filter((c) => t(c.label).toLowerCase().includes(q));
  if (found.length === 0) return null;
  const rows = view === null ? found : found.filter((c) => c.views.includes(view));

  const put = (next: ShortcutBindings) => {
    setRefusal(null);
    onChange(overridesOf(next));
  };

  const onKey = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (listening !== id) return;
    if (e.key === 'Tab') {
      setListening(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setListening(null);
      return;
    }
    const key = keyOfEvent(e);
    // A modifier alone, Alt or a named key: keep listening.
    if (key === null) return;
    const why = refuseKey(bindings, id, key);
    if (why === 'used') {
      const other = usedBy(bindings, id, key);
      const shared = other ? sharedView(id, other.id) : null;
      setRefusal({
        id,
        text: t('office.shortcuts.used_by', {
          command: other ? t(other.label) : key,
          view: shared ? t(VIEW_LABEL[shared]) : '',
        }),
      });
      return;
    }
    if (why === 'browser') {
      setRefusal({ id, text: t('office.shortcuts.browser') });
      return;
    }
    if (why !== null) return;
    setListening(null);
    put({ ...bindings, [id]: key });
  };

  return (
    <section className={styles.card} data-testid="defaults-group" data-group="keyboard_shortcuts">
      <div className={styles.head}>
        <div>
          <h2>{title}</h2>
          <p className={styles.subtitle} data-testid="shortcuts-subtitle">
            {t('office.shortcuts.subtitle', { count: SHORTCUT_COMMANDS.length })}
          </p>
        </div>
      </div>
      <div className={styles.bar}>
        <div
          className={styles.filter}
          role="group"
          aria-label={t('office.shortcuts.filter_label')}
          data-testid="shortcuts-filter"
        >
          {[null, ...SHORTCUT_VIEWS].map((v) => (
            <button
              key={v ?? 'all'}
              type="button"
              aria-pressed={view === v}
              data-testid={`shortcuts-filter-${v ?? 'all'}`}
              onClick={() => {
                setListening(null);
                setRefusal(null);
                setView(v);
              }}
            >
              {t(v === null ? 'office.shortcuts.filter_all' : VIEW_LABEL[v])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.textButton} ${styles.resetMap}`}
          data-testid="shortcuts-reset-map"
          disabled={readOnly}
          onClick={() => {
            setListening(null);
            put(resetToDefaultMap(bindings));
          }}
        >
          {t('office.shortcuts.reset_map')}
        </button>
      </div>
      <table className={styles.table} data-testid="shortcuts-table">
        <thead>
          <tr>
            <th scope="col">{t('office.shortcuts.col_command')}</th>
            <th scope="col">{t('office.shortcuts.col_key')}</th>
            <th scope="col">
              <span hidden>{t('office.shortcuts.reset_row')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const key = bindings[c.id];
            const on = listening === c.id;
            return (
              <tr key={c.id} data-testid="shortcut-row" data-command={c.id}>
                <td>{t(c.label)}</td>
                <td>
                  <button
                    type="button"
                    className={styles.key}
                    data-testid={`shortcut-key-${c.id}`}
                    aria-label={`${t(c.label)}: ${key ? keyLabel(key) : t('office.defaults.not_set')}`}
                    aria-pressed={on}
                    disabled={readOnly}
                    onClick={() => {
                      setRefusal(null);
                      setListening(on ? null : c.id);
                    }}
                    onBlur={() => {
                      if (on) setListening(null);
                    }}
                    onKeyDown={onKey(c.id)}
                  >
                    {on ? (
                      t('office.shortcuts.press')
                    ) : key ? (
                      keyLabel(key)
                    ) : (
                      <span className={styles.none}>{t('office.defaults.not_set')}</span>
                    )}
                  </button>
                  {refusal?.id === c.id ? (
                    <div className={styles.message} role="alert" data-testid="shortcut-refusal" data-command={c.id}>
                      {refusal.text}
                    </div>
                  ) : null}
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.textButton}
                    data-testid={`shortcut-reset-${c.id}`}
                    disabled={readOnly || key === ''}
                    onClick={() => {
                      setListening(null);
                      put({ ...bindings, [c.id]: '' });
                    }}
                  >
                    {t('office.shortcuts.reset_row')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.note} data-testid="shortcuts-note">
        {t('office.shortcuts.note')}
      </p>
      {error ? (
        <div data-testid="defaults-row-error" data-key="keyboard_shortcuts" role="alert" className={styles.message}>
          {t(error)}
        </div>
      ) : null}
    </section>
  );
}
