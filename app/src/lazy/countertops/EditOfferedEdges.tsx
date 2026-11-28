'use client';
// EZD-417 (S04b Controls "Edit offered edges | Inspector footer | Choose which profiles the client sees and enter the
// price difference per lf; the client sees the total | Requires Send to client; hidden otherwise"; S04b Decisions
// "The offered list shows only the profiles ticked in Edit offered edges. The full library ... is available there";
// R24 #33; Q-0760 (built from the written spec in the style of board S04b, no board); AC-EZD-417-1;
// vault/build/assumptions.md EZD-417): the window over the inspector where the profiles offered on this top are
// ticked, each with its price per LF and the total it makes for this top. Without See sell prices the price column is
// not shown and the saved prices are kept (the server keeps them; a new tick gets 0).
import { useState, type ReactElement } from 'react';
import { countertopExposedEdgeLf, edgeOfferTotal, type CountertopPieceData } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { formatDollars } from '../../lib/render-settings/models';
import type { EdgeOffer, EdgeOfferChoice, EdgeProfile } from '../../editor/countertops/edge-profile';
import { ProfileDrawing } from './EdgeProfileCard';
import styles from './EditOfferedEdges.module.css';
import { sameId } from '../../editor/shared/ids';

export type EditOfferedEdgesProps = {
  piece: CountertopPieceData;
  profiles: readonly EdgeProfile[];
  offer: EdgeOffer | null;
  canSeePrices: boolean;
  onSave(choices: EdgeOfferChoice[]): Promise<void>;
  onClose(): void;
};

type Row = { on: boolean; text: string };

const rateText = (n: number | undefined) => (n === undefined || n === 0 ? '0' : String(n));

// A price per LF as typed: dollars with at most two decimals, an optional "$"; null when it is not one.
export function parseRate(text: string): number | null {
  const s = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (s === '') return 0;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export function EditOfferedEdges({
  piece,
  profiles,
  offer,
  canSeePrices,
  onSave,
  onClose,
}: EditOfferedEdgesProps): ReactElement {
  const t = useT();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      profiles.map((p) => {
        const c = offer?.choices.find((x) => sameId(x.profileId, p.id));
        return [p.id, { on: c !== undefined, text: rateText(c?.ratePerLf) }];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const exposedLf = Math.round(countertopExposedEdgeLf(piece) * 10) / 10;
  const bad = canSeePrices && profiles.some((p) => rows[p.id]!.on && parseRate(rows[p.id]!.text) === null);

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  const save = async () => {
    if (bad || saving) return;
    const choices: EdgeOfferChoice[] = profiles
      .filter((p) => rows[p.id]!.on)
      .map((p) => (canSeePrices ? { profileId: p.id, ratePerLf: parseRate(rows[p.id]!.text)! } : { profileId: p.id }));
    setSaving(true);
    setFailed(false);
    try {
      await onSave(choices);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-label={t('office.countertops.edge.edit_offered')}
      data-testid="edit-offered-edges"
    >
      <div className={styles.head}>
        <span>{t('office.countertops.edge.edit_offered')}</span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('office.countertops.panel.close')}
          data-testid="edit-offered-close"
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        <p className={styles.intro}>{t('office.countertops.edge.edit_intro')}</p>
        <p className={styles.exposed} data-testid="edit-offered-exposed">
          {t('office.countertops.edge.exposed_lf', { lf: String(exposedLf) })}
        </p>
        {canSeePrices ? (
          <div className={styles.cols} aria-hidden="true">
            <span />
            <span>{t('office.countertops.edge.col_rate')}</span>
            <span>{t('office.countertops.edge.col_total')}</span>
          </div>
        ) : (
          <p className={styles.intro}>{t('office.countertops.edge.prices_hidden')}</p>
        )}
        <ul className={styles.list}>
          {profiles.map((p) => {
            const row = rows[p.id]!;
            const rate = parseRate(row.text);
            const id = `edge-offer-${p.id}`;
            return (
              <li key={p.id} className={styles.row} data-testid="edit-offered-row" data-key={p.key}>
                <label className={styles.tick} htmlFor={id}>
                  {/* EZD-2003: on a touch device the checkbox covers the whole label (a 44 px tap area) and the
                      drawn box beside it shows its state; with a mouse the box is the plain checkbox. */}
                  <input
                    id={id}
                    type="checkbox"
                    className={styles.tickInput}
                    checked={row.on}
                    data-testid="edit-offered-tick"
                    onChange={(e) => set(p.id, { on: e.target.checked })}
                  />
                  <span className={styles.check} aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                  <ProfileDrawing profile={p} size="large" />
                  <span>{p.name}</span>
                </label>
                {canSeePrices ? (
                  <>
                    <input
                      className={rate === null && row.on ? styles.rateBad : styles.rate}
                      data-testid="edit-offered-rate"
                      aria-label={t('office.countertops.edge.rate_label', { name: p.name })}
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={!row.on}
                      value={row.text}
                      onChange={(e) => set(p.id, { text: e.target.value })}
                    />
                    <span className={styles.total} data-testid="edit-offered-total">
                      {!row.on || rate === null
                        ? ''
                        : rate === 0
                          ? t('office.countertops.edge.included')
                          : t('office.countertops.edge.total', { amount: formatDollars(edgeOfferTotal(rate, piece)) })}
                    </span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        {bad ? (
          <p className={styles.error} role="alert" data-testid="edit-offered-bad">
            {t('office.countertops.edge.rate_bad')}
          </p>
        ) : null}
        {failed ? (
          <p className={styles.error} role="alert" data-testid="edit-offered-failed">
            {t('office.countertops.edge.save_failed')}
          </p>
        ) : null}
      </div>
      <div className={styles.foot}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          {t('office.countertops.edge.cancel')}
        </button>
        <button
          type="button"
          className={styles.save}
          data-testid="edit-offered-save"
          disabled={bad || saving}
          onClick={() => void save()}
        >
          {t('office.countertops.edge.save')}
        </button>
      </div>
    </div>
  );
}
