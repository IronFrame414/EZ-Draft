'use client';
// EZD-419 (S03 Controls — inspector (selection: Island run): "Title and subtitle", "Client selection tiles
// (Countertop, Cabinet finish) | Opens catalog picker for that selection | Shows swatch and item name", "Run total
// line", "Cabinet schedule | Inspector footer"; board S03Plan; AC-EZD-419-1, -2; vault/build/assumptions.md EZD-419):
// the inspector for a selected cabinet run, in the shell's inspector place while the Cabinets tool is on. Every viewer
// reads it; opening a picker needs Edit model and the lock (`canEdit`), and each pick is one model edit (one undo
// step). The live 3D preview is EZD-1017; the status pill, size fields and More are not part of this ticket.
import { useMemo, useState, type ReactElement } from 'react';
import type { ModelObject } from '@ezdraft/geometry';
import { CatalogPickerView } from '../../components/catalog/CatalogPicker';
import type { CatalogCategory, CatalogItem } from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import { inchText } from '../../editor/shared/inch-text';
import { sameId } from '../../editor/shared/ids';
import type { Change } from '../../editor/model/patches';
import type { CabinetView } from '../../editor/cabinets/cabinet-view';
import {
  runCountertopChanges,
  runFinishChanges,
  runInspectorView,
  type RunSelection,
} from '../../editor/cabinets/run-inspector';
import type { CatalogState } from './BoxInspector';
import { CabinetScheduleView } from './CabinetSchedule';
import styles from './RunInspector.module.css';

export type RunInspectorProps = {
  view: CabinetView;
  objects: readonly ModelObject[];
  catalog: CatalogState;
  canEdit: boolean;
  canExport: boolean;
  onChanges(changes: Change[]): unknown;
};

type Picking = 'countertop' | 'finish';

export function RunInspector({
  view,
  objects,
  catalog,
  canEdit,
  canExport,
  onChanges,
}: RunInspectorProps): ReactElement {
  const t = useT();
  const [picking, setPicking] = useState<Picking | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const run = useMemo(() => runInspectorView(view, objects), [view, objects]);
  const items = catalog.kind === 'ready' ? catalog.items : [];

  const contents = [
    t('office.cabinets.boxes', { count: run.boxCount }),
    ...(run.fillerCount > 0 ? [t('office.cabinets.fillers', { count: run.fillerCount })] : []),
    ...(run.endPanelCount > 0
      ? [t('office.cabinets.run.end_panels', { count: run.endPanelCount })]
      : []),
    ...(run.panelCount > 0 ? [t('office.cabinets.run.panels', { count: run.panelCount })] : []),
  ].join(' · ');
  const list = [
    ...run.codes,
    ...(run.panels > 0 ? [t('office.cabinets.run.panels', { count: run.panels })] : []),
  ].join(' + ');

  const text = (s: RunSelection, name: (v: string) => string) =>
    s.kind === 'none'
      ? t('office.cabinets.none')
      : s.kind === 'mixed'
        ? t('office.cabinets.run.mixed')
        : name(s.value);
  const itemName = (id: string) =>
    items.find((i) => sameId(i.id, id))?.name ?? t('office.cabinets.none');

  // The finish picker lists the cabinet items that carry a finish; the countertop picker the countertop items.
  const pickItems: Record<Picking, CatalogItem[]> = {
    finish: items.filter((i) => i.category === 'cabinets' && i.finish !== null && i.finish !== ''),
    countertop: items.filter((i) => i.category === 'countertops'),
  };
  const pickCategory: Record<Picking, CatalogCategory> = {
    finish: 'cabinets',
    countertop: 'countertops',
  };
  const pick = (which: Picking, item: CatalogItem) => {
    onChanges(
      which === 'finish'
        ? runFinishChanges(view, objects, item.finish!)
        : runCountertopChanges(view, objects, item.id),
    );
    setPicking(null);
  };

  const tiles: { which: Picking; label: string; value: string; off: boolean }[] = [
    {
      which: 'countertop',
      label: t('office.cabinets.run.countertop'),
      value: text(run.countertop, itemName),
      // A run with no countertop piece over it has nothing to set.
      off: !canEdit || catalog.kind !== 'ready' || run.countertopIds.length === 0,
    },
    {
      which: 'finish',
      label: t('office.cabinets.run.cabinet_finish'),
      value: text(run.finish, (v) => v),
      off: !canEdit || catalog.kind !== 'ready',
    },
  ];

  return (
    <div className={styles.panel} data-testid="run-inspector" data-run-id={run.id}>
      <header className={styles.header}>
        <h2 className={styles.title} data-testid="run-inspector-title">
          {run.name}
        </h2>
        <span className={styles.subtitle} data-testid="run-inspector-contents">
          {contents}
        </span>
      </header>

      <section className={styles.section}>
        <h3 className={styles.head}>{t('office.cabinets.run.selections')}</h3>
        <div className={styles.tiles}>
          {tiles.map((tile) => (
            <button
              key={tile.which}
              type="button"
              className={styles.tile}
              data-testid={`run-inspector-${tile.which}`}
              data-selection={tile.which === 'finish' ? run.finish.kind : run.countertop.kind}
              disabled={tile.off}
              onClick={() => setPicking(tile.which)}
            >
              <span className={`${styles.swatch} ${styles[`swatch_${tile.which}`]}`} aria-hidden />
              <span className={styles.tileText}>
                <span className={styles.tileLabel}>{tile.label}</span>
                <span
                  className={styles.tileValue}
                  data-testid={`run-inspector-${tile.which}-value`}
                >
                  {tile.value}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.totalLine}`}
        data-testid="run-inspector-total-line"
      >
        <span className={styles.list} data-testid="run-inspector-list">
          {list}
        </span>
        <span className={styles.total} data-testid="run-inspector-total">
          {inchText(run.total)}
        </span>
      </section>

      <span className={styles.grow} />
      <footer className={styles.footer}>
        {/* EZD-409: every viewer opens the schedule (S04 Permissions "View projects"). */}
        <button
          type="button"
          className={styles.footerButton}
          data-testid="run-inspector-schedule"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen(true)}
        >
          {t('office.cabinets.schedule')}
        </button>
      </footer>

      {scheduleOpen ? (
        <CabinetScheduleView
          objects={objects}
          canExport={canExport}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}

      {picking !== null ? (
        <div
          className={styles.pickerLayer}
          role="dialog"
          aria-label={t(
            picking === 'finish'
              ? 'office.cabinets.run.pick_finish'
              : 'office.cabinets.run.pick_countertop',
          )}
          data-testid="run-inspector-picker"
        >
          <div className={styles.pickerHead}>
            <span>
              {t(
                picking === 'finish'
                  ? 'office.cabinets.run.pick_finish'
                  : 'office.cabinets.run.pick_countertop',
              )}
            </span>
            <button
              type="button"
              className={styles.close}
              onClick={() => setPicking(null)}
              aria-label={t('office.cabinets.close')}
            >
              ×
            </button>
          </div>
          <CatalogPickerView
            items={pickItems[picking]}
            initialCategory={pickCategory[picking]}
            onPick={(i) => pick(picking, i)}
          />
        </div>
      ) : null}
    </div>
  );
}
