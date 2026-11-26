'use client';
// EZD-703 (S13 Rail: Viewport "Add or edit a viewport; set scale per viewport", "Plans 1/4\", elevations 1/2\"
// default"; S13 Permissions "Edit sheets (viewports ...): Edit model, plus edit lock"; S13 States "View-only":
// annotation tools disabled): the open sheet's viewports, each with its type, view, floor and scale. With Edit model
// and the lock each is a picker and the sheet can gain or lose a viewport; otherwise the same rows are read only.
// The sheet rail comes with EZD-704, so the tool sits in the left panel under the sheet list until then
// (vault/build/assumptions/EZD-703.md).
// EZD-707 (R24 "any other wall is added with Add elevation"; AC-EZD-707-3): with Edit model and the lock, the sheet's
// first elevation viewport carries an Add elevation picker of the floor's walls it does not draw yet; picking one
// adds that wall's elevation to the sheet.
import type { ReactElement } from 'react';
import {
  SHEET_VIEWS,
  VIEWPORT_KINDS,
  VIEWPORT_SCALES,
  type SheetView,
  type ViewportKind,
  type ViewportScale,
} from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import { newViewport, viewportScaleLabel } from '../../lib/sheets/viewport';
import type { MessageKey } from '../../server/messages/catalog';
import type { SheetsScreen } from './sheets-screen-store';
import { useSheetsScreen } from './use-sheets-screen';
import styles from './SheetsScreen.module.css';

const KIND_KEYS: Record<ViewportKind, MessageKey> = {
  plan: 'office.sheets.add.plan',
  elevation: 'office.sheets.add.elevation',
};

const VIEW_KEYS: Record<SheetView, MessageKey> = {
  existing: 'office.sheets.viewport.view.existing',
  demo: 'office.sheets.viewport.view.demo',
  proposed: 'office.sheets.viewport.view.proposed',
};

export function ViewportTool({ screen, canEdit }: { screen: SheetsScreen; canEdit: boolean }): ReactElement | null {
  const t = useT();
  const state = useSheetsScreen(screen);
  const sheet = state.open;
  if (state.load !== 'ready' || sheet === null) return null;
  const lowest = state.floors[0]?.id ?? '';
  const firstElevation = state.viewports.findIndex((v) => v.kind === 'elevation');
  return (
    <section className={styles.viewports} aria-label={t('office.sheets.viewports')} data-testid="sheet-viewports">
      <h3 className={styles.groupLabel}>{t('office.sheets.viewports')}</h3>
      {state.viewports.length === 0 ? <p className={styles.note}>{t('office.sheets.viewport.none')}</p> : null}
      {state.viewports.map((vp, i) => {
        const floor = state.floors.some((f) => f.id === vp.level) ? vp.level! : lowest;
        return (
          <div key={vp.id ?? `default-${i}`} className={styles.viewport} data-testid={`sheet-viewport-${i}`}>
            <label className={styles.viewportField}>
              <span>{t('office.sheets.viewport.kind')}</span>
              <select
                value={vp.kind}
                disabled={!canEdit}
                data-testid={`sheet-viewport-${i}-kind`}
                onChange={(e) => screen.editViewport({ kind: 'update', index: i, patch: { kind: e.target.value as ViewportKind } })}
              >
                {VIEWPORT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_KEYS[k])}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.viewportField}>
              <span>{t('office.sheets.viewport.view')}</span>
              <select
                value={vp.view}
                disabled={!canEdit}
                data-testid={`sheet-viewport-${i}-view`}
                onChange={(e) => screen.editViewport({ kind: 'update', index: i, patch: { view: e.target.value as SheetView } })}
              >
                {SHEET_VIEWS.map((v) => (
                  <option key={v} value={v}>
                    {t(VIEW_KEYS[v])}
                  </option>
                ))}
              </select>
            </label>
            {state.floors.length > 1 ? (
              <label className={styles.viewportField}>
                <span>{t('office.sheets.viewport.floor')}</span>
                <select
                  value={floor}
                  disabled={!canEdit}
                  data-testid={`sheet-viewport-${i}-floor`}
                  onChange={(e) => screen.editViewport({ kind: 'update', index: i, patch: { level: e.target.value } })}
                >
                  {state.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={styles.viewportField}>
              <span>{t('office.sheets.viewport.scale')}</span>
              <select
                value={vp.scale}
                disabled={!canEdit}
                data-testid={`sheet-viewport-${i}-scale`}
                onChange={(e) => screen.editViewport({ kind: 'update', index: i, patch: { scale: e.target.value as ViewportScale } })}
              >
                {VIEWPORT_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {viewportScaleLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            {canEdit && i === firstElevation ? (
              <label className={styles.viewportField}>
                <span>{t('office.sheets.viewport.add_elevation')}</span>
                <select
                  value=""
                  data-testid="sheet-elevation-add"
                  disabled={state.elevationWalls.length === 0}
                  onChange={(e) => {
                    if (e.target.value !== '') screen.addElevation(e.target.value);
                  }}
                >
                  <option value="">{t('office.sheets.viewport.add_elevation')}</option>
                  {state.elevationWalls.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.number === null
                        ? t('office.sheets.viewport.wall_unnumbered')
                        : t('office.sheets.viewport.wall', { number: w.number })}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className={styles.viewportRemove}
                data-testid={`sheet-viewport-${i}-remove`}
                onClick={() => screen.editViewport({ kind: 'remove', index: i })}
              >
                {t('office.sheets.viewport.remove')}
              </button>
            ) : null}
          </div>
        );
      })}
      {canEdit ? (
        <button
          type="button"
          className={styles.add}
          data-testid="sheet-viewport-add"
          onClick={() => screen.editViewport({ kind: 'add', viewport: newViewport(sheet) })}
        >
          {t('office.sheets.viewport.add')}
        </button>
      ) : null}
    </section>
  );
}
