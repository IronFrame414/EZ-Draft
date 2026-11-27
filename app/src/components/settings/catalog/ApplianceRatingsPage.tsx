'use client';

// EZD-614 (S15e Controls "Appliance rating defaults | Fallback ratings (volts, amps or VA) per appliance type when a
// catalog item lacks specs | Owner enters (Round 24)", "Save | Footer | Saves catalog settings | Disabled with no
// edits"; S15e States "loading, error, offline read-only"; Q-0766 "every company can edit, add and delete rows"; board
// S15eCatalog "Appliance rating defaults", "Owner enters", "Used by the load calc when a catalog item has no specs.",
// TYPE / VOLTS / AMPS, "+ Add appliance type", footer Discard and Save; assumptions EZD-614): the Settings > Catalog
// page body. This ticket builds only the Appliance rating defaults card; the other S15e parts are EZD-1609 and
// EZD-1617. Save writes the whole list; the editor's load calc then reads it (defaults-source.ts).
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { sharedApplianceDefaults } from '../../../lib/appliance-ratings/defaults-source';
import {
  APPLIANCE_NAME_MAX,
  APPLIANCE_TYPES,
  APPLIANCE_VOLTS,
  parseAmps,
  type ApplianceRating,
  type ApplianceType,
} from '../../../lib/appliance-ratings/ratings';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import { useOnline } from '../../../lib/network';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain } from '../SettingsShell';
import { useUnsavedChanges } from '../unsaved-changes';
import styles from './ApplianceRatings.module.css';

export function applianceTypeLabel(type: ApplianceType): MessageKey {
  return `office.appliance_ratings.type.${type}`;
}

/** One row as typed: amps stay text until saved. */
export type RatingDraft = { applianceType: string; name: string; volts: number; amps: string };

/** 240 V for the types that are 240 V appliances in 09s; 120 V for the rest. The user can change it. */
const VOLTS_240: ReadonlySet<string> = new Set([
  'range',
  'cooktop',
  'wall_oven',
  'dryer',
  'water_heater',
  'ac',
]);

export function draftsOf(rows: readonly ApplianceRating[]): RatingDraft[] {
  return rows.map((r) => ({
    applianceType: r.applianceType,
    name: r.name,
    volts: r.volts,
    amps: String(r.amps),
  }));
}

/** The rows to save, or null while a row is not valid (a blank name, amps not above 0 with up to 2 decimals). */
export function ratingsOf(drafts: readonly RatingDraft[]): ApplianceRating[] | null {
  const out: ApplianceRating[] = [];
  for (const d of drafts) {
    const amps = parseAmps(d.amps);
    const name = d.name.trim();
    if (amps === null || name.length === 0) return null;
    out.push({ applianceType: d.applianceType, name, volts: d.volts, amps });
  }
  return out;
}

const same = (a: readonly RatingDraft[], b: readonly RatingDraft[]) =>
  a.length === b.length &&
  a.every((r, i) => {
    const o = b[i]!;
    return (
      r.applianceType === o.applianceType &&
      r.name.trim() === o.name.trim() &&
      r.volts === o.volts &&
      parseAmps(r.amps) === parseAmps(o.amps) &&
      (parseAmps(r.amps) !== null || r.amps === o.amps)
    );
  });

export function ApplianceRatingsPage({
  initial,
  fetchImpl,
}: {
  initial: readonly ApplianceRating[];
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const [saved, setSaved] = useState<RatingDraft[]>(() => draftsOf(initial));
  const [drafts, setDrafts] = useState<RatingDraft[]>(() => draftsOf(initial));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const readOnly = !online;
  const dirty = !same(drafts, saved);
  const rows = ratingsOf(drafts);
  const unused = useMemo(
    () => APPLIANCE_TYPES.filter((type) => !drafts.some((d) => d.applianceType === type)),
    [drafts],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (rows === null) return false;
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await (fetchImpl ?? fetch)('/api/settings/appliance-ratings', {
        method: 'PUT',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { rows: ApplianceRating[] };
        setSaved(draftsOf(body.rows));
        setDrafts(draftsOf(body.rows));
        sharedApplianceDefaults.set(body.rows);
        router.refresh();
        return true;
      }
      setSaveFailed(true);
      return false;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirty, rows, fetchImpl, router]);

  useUnsavedChanges(dirty, save);

  const edit = (i: number, patch: Partial<RatingDraft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = (type: ApplianceType) =>
    setDrafts((ds) => [
      ...ds,
      {
        applianceType: type,
        name: t(applianceTypeLabel(type)),
        volts: VOLTS_240.has(type) ? 240 : 120,
        amps: '',
      },
    ]);
  const buttonsOff = readOnly || saving || !dirty;

  return (
    <SettingsMain section="catalog" title="office.settings.section.catalog" flush>
      <div className={styles.page} data-testid="appliance-ratings-page">
        <div className={styles.body}>
          {online ? null : (
            <div data-testid="appliance-ratings-offline">
              <OfflineBanner message="office.appliance_ratings.offline" />
            </div>
          )}
          {saveFailed ? (
            <div data-testid="appliance-ratings-save-error">
              <InlineError
                message="office.appliance_ratings.save_failed"
                onRetry={() => void save()}
              />
            </div>
          ) : null}
          <section
            className={styles.card}
            data-testid="appliance-ratings"
            aria-labelledby="appliance-ratings-title"
          >
            <div className={styles.head}>
              <h2 className={styles.title} id="appliance-ratings-title">
                {t('office.appliance_ratings.title')}
              </h2>
              <span className={styles.owner}>{t('office.appliance_ratings.owner_enters')}</span>
            </div>
            <p className={styles.hint}>{t('office.appliance_ratings.hint')}</p>
            {drafts.length === 0 ? (
              <p className={styles.empty} data-testid="appliance-ratings-empty">
                {t('office.appliance_ratings.empty')}
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t('office.appliance_ratings.col_type')}</th>
                    <th scope="col" className={styles.numCol}>
                      {t('office.appliance_ratings.col_volts')}
                    </th>
                    <th scope="col" className={styles.numCol}>
                      {t('office.appliance_ratings.col_amps')}
                    </th>
                    {readOnly ? null : <th className={styles.removeCol} aria-hidden="true" />}
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, i) => {
                    const ampsBad = d.amps.trim() !== '' && parseAmps(d.amps) === null;
                    const nameBad = d.name.trim() === '';
                    return (
                      <tr
                        key={d.applianceType}
                        data-testid="appliance-rating-row"
                        data-type={d.applianceType}
                      >
                        <td>
                          <input
                            className={`${styles.nameInput} ${nameBad ? styles.invalid : ''}`}
                            data-testid="appliance-rating-name"
                            aria-label={t('office.appliance_ratings.col_type')}
                            aria-invalid={nameBad || undefined}
                            maxLength={APPLIANCE_NAME_MAX}
                            disabled={readOnly}
                            value={d.name}
                            onChange={(e) => edit(i, { name: e.target.value })}
                          />
                          {nameBad ? (
                            <span className={styles.rowError}>
                              {t('office.appliance_ratings.name_invalid')}
                            </span>
                          ) : null}
                        </td>
                        <td className={styles.numCol}>
                          <select
                            className={styles.voltsSelect}
                            data-testid="appliance-rating-volts"
                            aria-label={`${d.name} ${t('office.appliance_ratings.col_volts')}`}
                            disabled={readOnly}
                            value={d.volts}
                            onChange={(e) => edit(i, { volts: Number(e.target.value) })}
                          >
                            {APPLIANCE_VOLTS.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.numCol}>
                          <span className={styles.amps}>
                            <input
                              className={`${styles.numInput} ${ampsBad ? styles.invalid : ''}`}
                              data-testid="appliance-rating-amps"
                              aria-label={`${d.name} ${t('office.appliance_ratings.col_amps')}`}
                              aria-invalid={ampsBad || undefined}
                              inputMode="decimal"
                              disabled={readOnly}
                              value={d.amps}
                              onChange={(e) => edit(i, { amps: e.target.value })}
                            />
                            <span className={styles.unit} aria-hidden="true">
                              {t('office.appliance_ratings.amps_unit')}
                            </span>
                          </span>
                          {ampsBad ? (
                            <span className={styles.rowError}>
                              {t('office.appliance_ratings.amps_invalid')}
                            </span>
                          ) : null}
                        </td>
                        {readOnly ? null : (
                          <td className={styles.removeCol}>
                            <button
                              type="button"
                              className={styles.remove}
                              data-testid="appliance-rating-remove"
                              aria-label={t('office.appliance_ratings.remove', { name: d.name })}
                              onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {readOnly || unused.length === 0 ? null : (
              <select
                className={styles.add}
                data-testid="appliance-ratings-add"
                aria-label={t('office.appliance_ratings.add')}
                value=""
                onChange={(e) => {
                  const v = APPLIANCE_TYPES.find((type) => type === e.target.value);
                  if (v !== undefined) add(v);
                }}
              >
                <option value="">+ {t('office.appliance_ratings.add')}</option>
                {unused.map((type) => (
                  <option key={type} value={type}>
                    {t(applianceTypeLabel(type))}
                  </option>
                ))}
              </select>
            )}
          </section>
        </div>
        <div className={styles.footer}>
          {dirty ? (
            <span data-testid="appliance-ratings-unsaved" className={styles.unsaved}>
              <span aria-hidden="true" className={styles.dot} />
              {t('office.appliance_ratings.unsaved')}
            </span>
          ) : null}
          <span className={styles.spacer} />
          <StateButton
            className={styles.plainButton}
            data-testid="appliance-ratings-discard"
            disabled={buttonsOff}
            onClick={() => {
              setDrafts(saved);
              setSaveFailed(false);
            }}
          >
            {t('office.appliance_ratings.discard')}
          </StateButton>
          <StateButton
            variant="primary"
            className={styles.saveButton}
            data-testid="appliance-ratings-save"
            disabled={buttonsOff || rows === null}
            onClick={() => void save()}
          >
            {t('office.appliance_ratings.save')}
          </StateButton>
        </div>
      </div>
    </SettingsMain>
  );
}

export function ApplianceRatingsLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="catalog" title="office.settings.section.catalog">
      <div data-testid="appliance-ratings-load-error">
        <InlineError
          message="office.appliance_ratings.load_failed"
          onRetry={() => router.refresh()}
        />
      </div>
    </SettingsMain>
  );
}
