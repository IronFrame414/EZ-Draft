'use client';
// EZD-508 (S05 Controls "Fixture schedule rows ... tag, description, count. Click selects all fixtures of that type on
// canvas. | Read only list."; board S05Ceiling left panel "Fixture schedule", rows "A  4" can, 3000K  ×8"): the
// fixture schedule section of the left panel on Ceiling or Both. A row press selects the row's fixtures; it is
// allowed in view only (selection is). The description is the kind with the color temperature when set
// (vault/build/assumptions.md EZD-508). Loaded lazily (with the RCP, rcp-module.ts); the rows are worked out here from the
// model store's objects on every change, so the counts follow each placed or deleted light.
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import { fixtureScheduleRows } from './fixture-schedule';
import styles from './FixtureSchedule.module.css';

export function FixtureSchedule({
  store,
  floors,
  onPick,
}: {
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  // The floor the user chose (EZD-6001); without it the lowest floor.
  floors?: FloorChoice;
  onPick: (ids: string[]) => void;
}): ReactElement {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const rows = useMemo(
    () => fixtureScheduleRows(objects, openFloorId(objects, chosen)),
    [objects, chosen],
  );
  return (
    <section className={styles.schedule} data-testid="fixture-schedule">
      <span className={styles.lbl}>{t('office.ceiling.schedule.heading')}</span>
      {rows.length === 0 ? null : (
        <div className={styles.list}>
          {rows.map((row) => {
            const kind = t(`office.fixtures.detail.${row.kind}`);
            const description =
              row.colorTemp === null
                ? kind
                : t('office.ceiling.schedule.with_color_temp', { kind, kelvin: row.colorTemp });
            return (
              <button
                key={row.tag ?? `untagged:${row.kind}`}
                type="button"
                className={`${styles.row} ${touch.target}`}
                data-testid="fixture-schedule-row"
                data-tag={row.tag ?? ''}
                onClick={() => onPick(row.ids)}
              >
                <span className={styles.tag} data-testid="fixture-schedule-tag">
                  {row.tag ?? t('office.ceiling.schedule.no_tag')}
                </span>
                <span className={styles.desc} data-testid="fixture-schedule-description">
                  {description}
                </span>
                <span className={styles.count} data-testid="fixture-schedule-count">
                  {t('office.ceiling.schedule.count', { count: row.count })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
