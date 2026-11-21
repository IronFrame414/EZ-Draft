'use client';
// EZD-702a (S13 Layout "Left panel: set selector; sheet list grouped Architectural / Electrical / Renderings; Add
// sheet; legend"; S13 Controls "Set selector", "Sheet row", "Add sheet"; board S13Sheets left panel;
// AC-EZD-702a-1): a row opens its sheet. The set selector switches between the Permit set and the Client set and
// shows the sheet count, size and revision. Add sheet (Edit model and the edit lock) opens the type picker; its types
// are shown but cannot be picked until sheets are stored objects (vault/build/assumptions.md EZD-702a).
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { SheetSetKind } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { InlineError } from '../../components/states/InlineError';
import { useT } from '../../lib/messages';
import {
  ADD_SHEET_TYPES,
  SHEET_GROUPS,
  draftRevision,
  sheetDot,
  type SheetGroup,
} from '../../lib/sheets/sheet-set';
import type { MessageKey } from '../../server/messages/catalog';
import { sheetMarks, sizeLabel, useRevisionLabel } from './sheet-labels';
import type { SheetsScreen } from './sheets-screen-store';
import { useSheetsScreen } from './use-sheets-screen';
import styles from './SheetsScreen.module.css';

export type SheetsPanelProps = { screen: SheetsScreen; canEdit: boolean };

const GROUP_KEYS: Record<SheetGroup, MessageKey> = {
  architectural: 'office.sheets.group.architectural',
  electrical: 'office.sheets.group.electrical',
  renderings: 'office.sheets.group.renderings',
};

const SET_KEYS: Record<SheetSetKind, MessageKey> = {
  permit: 'office.sheets.set.permit',
  client: 'office.sheets.set.client',
};

const ADD_KEYS: Record<(typeof ADD_SHEET_TYPES)[number], MessageKey> = {
  plan: 'office.sheets.add.plan',
  elevation: 'office.sheets.add.elevation',
  details: 'office.sheets.add.details',
  schedule: 'office.sheets.add.schedule',
  renders: 'office.sheets.add.renders',
  blank: 'office.sheets.add.blank',
};

// A menu open below its button; Escape or a press outside the wrapper closes it.
function useCloseOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function SetSelector({ screen }: { screen: SheetsScreen }): ReactElement {
  const t = useT();
  const state = useSheetsScreen(screen);
  const set = state.sets.find((s) => s.kind === state.kind) ?? null;
  const revLabel = useRevisionLabel(set);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useCloseOutside(open, close);
  return (
    <div className={styles.setHead} ref={ref}>
      <button
        type="button"
        className={styles.setButton}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="sheets-set-selector"
        onClick={() => setOpen(!open)}
      >
        <span className={styles.setName}>{t(SET_KEYS[state.kind])}</span>
        <Icon name="expand_more" size={18} />
      </button>
      {set !== null ? (
        <span className={styles.setSummary} data-testid="sheets-set-summary">
          {t('office.sheets.set_summary', {
            count: set.sheets.length,
            size: sizeLabel(set.size),
            rev: revLabel,
          })}
        </span>
      ) : null}
      {open ? (
        <div className={styles.menu} role="menu" aria-label={t('office.sheets.choose_set')}>
          {state.sets.map((s) => (
            <button
              key={s.kind}
              type="button"
              role="menuitemradio"
              aria-checked={s.kind === state.kind}
              className={styles.menuItem}
              onClick={() => {
                screen.chooseSet(s.kind);
                setOpen(false);
              }}
            >
              {t(SET_KEYS[s.kind])}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AddSheet(): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useCloseOutside(open, close);
  return (
    <div className={styles.addWrap} ref={ref}>
      <button
        type="button"
        className={styles.add}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="sheets-add"
        onClick={() => setOpen(!open)}
      >
        <Icon name="add" size={18} />
        {t('office.sheets.add_sheet')}
      </button>
      {open ? (
        <div
          className={styles.menu}
          role="menu"
          aria-label={t('office.sheets.add_title')}
          data-testid="sheets-add-picker"
        >
          {ADD_SHEET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              aria-disabled="true"
              className={styles.menuItem}
            >
              {t(ADD_KEYS[type])}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SheetsPanel({ screen, canEdit }: SheetsPanelProps): ReactElement {
  const t = useT();
  const state = useSheetsScreen(screen);
  const set = state.sets.find((s) => s.kind === state.kind) ?? null;

  if (state.load === 'failed') {
    return (
      <div className={styles.panel} data-testid="sheets-panel">
        <InlineError message="office.sheets.load_failed" onRetry={() => void screen.load()} />
      </div>
    );
  }
  const sheets = set?.sheets ?? [];
  const clouded = sheets.some((s) => sheetMarks(s).delta !== null);
  const rev = set === null ? null : draftRevision(set);

  return (
    <div className={styles.panel} data-testid="sheets-panel">
      <SetSelector screen={screen} />
      <nav className={styles.list} aria-label={t('office.sheets.list')}>
        {state.load === 'loading' && set === null ? (
          <p className={styles.note} role="status">
            {t('office.sheets.loading')}
          </p>
        ) : null}
        {SHEET_GROUPS.map((group) => {
          const rows = sheets.filter((s) => s.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className={styles.group}>
              <h3 className={styles.groupLabel}>{t(GROUP_KEYS[group])}</h3>
              {rows.map((s) => {
                const marks = sheetMarks(s);
                const active = s.number === state.open;
                return (
                  <button
                    key={s.number}
                    type="button"
                    className={active ? `${styles.row} ${styles.rowOn}` : styles.row}
                    aria-current={active ? 'page' : undefined}
                    data-testid={`sheet-row-${s.number}`}
                    onClick={() => screen.open(s.number)}
                  >
                    <span className={`${styles.dot} ${styles[sheetDot(marks)]}`} aria-hidden="true" />
                    <span className={styles.number}>{s.number}</span>
                    <span className={styles.title}>{s.title}</span>
                    {marks.delta !== null ? (
                      <span className={styles.delta}>{`Δ${marks.delta}`}</span>
                    ) : null}
                    {marks.openItems > 0 ? (
                      <span className={styles.open}>
                        {t('office.sheets.open_items', { count: marks.openItems })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </section>
          );
        })}
        {canEdit ? <AddSheet /> : null}
      </nav>
      <ul className={styles.legend} aria-label={t('office.sheets.legend')}>
        <li>
          <span className={`${styles.dot} ${styles.ready}`} aria-hidden="true" />
          {t('office.sheets.legend.ready')}
        </li>
        <li>
          <span className={`${styles.dot} ${styles.needs_approval}`} aria-hidden="true" />
          {t('office.sheets.legend.needs_approval')}
        </li>
        {clouded && rev !== null ? (
          <li>
            <span className={styles.delta}>{`Δ${rev}`}</span>
            {t('office.sheets.legend.clouded', { n: rev })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
