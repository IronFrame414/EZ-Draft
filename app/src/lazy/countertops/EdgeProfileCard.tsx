'use client';
// EZD-417 (S04b Layout "Inspector: ... Edge profile; offered list; Edit offered edges"; S04b Controls "Edge profile
// card | Pick profile from library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom | Applied
// to exposed edges only", "Offered profile rows | Display offered profiles with the price difference as a total for
// this top (price per lf × exposed edge length) | Price hidden without See sell prices", "Edge profile status pill
// ("Edge profile: client choosing") | Canvas header | Scrolls inspector to Edge profile | Shows Open, Chosen states";
// S04b States "Edge profile open (client choosing), chosen, or not offered"; R24 #33 "Edge profile price shows as a
// total"; board S04bCountertops inspector "Edge profile", "Exposed edges only", "Client choosing", "Open", "Offered to
// client", "Included"; AC-EZD-417-1; vault/build/assumptions.md EZD-417): the selected top's edge profile card, its
// offered list, the canvas pill, and the project's edge offers shared by the inspector and the canvas.
import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { useParams } from 'next/navigation';
import { countertopPieceProfileId, edgeOfferTotal, type CountertopPieceData } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import { formatDollars } from '../../lib/render-settings/models';
import {
  edgeOfferState,
  fetchEdgeOffers,
  type EdgeOffer,
  type EdgeOfferState,
  type EdgeOffersLoad,
  type EdgeProfile,
} from '../../editor/countertops/edge-profile';
import styles from './CountertopPieceInspector.module.css';

// The project the editor shows: the one passed, else the editor route's [id].
export function useProjectId(given?: string | null): string | null {
  const params = useParams<{ id?: string }>();
  if (given !== undefined) return given;
  const id = params?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

// The project's edge offers, read once and shared by the inspector and the canvas pill; a save replaces its top's
// offer for both.
type Entry = { offers: readonly EdgeOffer[] | null; subs: Set<() => void>; started: boolean };
const entries = new Map<string, Entry>();
const entryFor = (projectId: string): Entry => {
  let e = entries.get(projectId);
  if (e === undefined) {
    e = { offers: null, subs: new Set(), started: false };
    entries.set(projectId, e);
  }
  return e;
};
const notify = (e: Entry) => e.subs.forEach((f) => f());
const noSubscribe = () => () => {};
const nothing = () => null;

export function setEdgeOffers(projectId: string, offers: readonly EdgeOffer[]): void {
  const e = entryFor(projectId);
  e.offers = offers;
  e.started = true;
  notify(e);
}

export function replaceEdgeOffer(projectId: string, pieceId: string, offer: EdgeOffer | null): void {
  const e = entryFor(projectId);
  const rest = (e.offers ?? []).filter((o) => o.pieceId.toLowerCase() !== pieceId.toLowerCase());
  e.offers = offer === null ? rest : [...rest, offer];
  notify(e);
}

export function useEdgeOffers(
  projectId: string | null,
  load: EdgeOffersLoad = fetchEdgeOffers,
): readonly EdgeOffer[] | null {
  const e = projectId === null ? null : entryFor(projectId);
  const offers = useSyncExternalStore(
    e === null
      ? noSubscribe
      : (f: () => void) => {
          e.subs.add(f);
          return () => e.subs.delete(f);
        },
    e === null ? nothing : () => e.offers,
    e === null ? nothing : () => e.offers,
  );
  useEffect(() => {
    if (projectId === null) return;
    const en = entryFor(projectId);
    if (en.started) return;
    en.started = true;
    load(projectId).then(
      (o) => setEdgeOffers(projectId, o),
      () => {
        en.started = false;
      },
    );
  }, [projectId, load]);
  return offers;
}

// A profile's section drawing, shown as an image so its markup never runs in the page.
export function ProfileDrawing({ profile, size = 'small' }: { profile: EdgeProfile | null; size?: 'small' | 'large' }) {
  const cls = size === 'large' ? styles.profileDrawingLarge : styles.profileDrawing;
  if (profile === null) return <span className={cls} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data URL drawing; there is nothing to optimise
    <img
      className={cls}
      src={`data:image/svg+xml;utf8,${encodeURIComponent(profile.sectionSvg)}`}
      alt=""
      aria-hidden="true"
      data-testid="edge-profile-drawing"
      data-key={profile.key}
    />
  );
}

const PILL_KEY = {
  open: 'office.countertops.edge.pill_open',
  chosen: 'office.countertops.edge.pill_chosen',
  not_offered: 'office.countertops.edge.pill_not_offered',
} as const;

// The canvas pill (board "Edge profile: client choosing"); a click brings the inspector's card into view.
export function EdgeProfilePill({ state }: { state: EdgeOfferState }): ReactElement {
  const t = useT();
  return (
    <button
      type="button"
      className={state === 'open' ? styles.pillOpen : styles.pill}
      data-testid="edge-profile-pill"
      data-state={state}
      onClick={() => {
        const card = document.querySelector('[data-testid="edge-profile-card"]');
        if (card instanceof HTMLElement) card.scrollIntoView({ block: 'nearest' });
      }}
    >
      {t(PILL_KEY[state])}
    </button>
  );
}

export type EdgeProfileCardProps = {
  piece: CountertopPieceData;
  profiles: readonly EdgeProfile[] | null;
  offer: EdgeOffer | null;
  // Edit model and the lock: the profile picker works.
  canEdit: boolean;
  // See sell prices: the offered rows show their totals.
  canSeePrices: boolean;
  onPick(profileId: string): void;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function EdgeProfileCard({
  piece,
  profiles,
  offer,
  canEdit,
  canSeePrices,
  onPick,
}: EdgeProfileCardProps): ReactElement {
  const t = useT();
  const state = edgeOfferState(offer);
  const currentId = countertopPieceProfileId(piece);
  const current = currentId === null ? null : (profiles?.find((p) => same(p.id, currentId)) ?? null);
  const byId = (id: string) => profiles?.find((p) => same(p.id, id)) ?? null;
  const heading =
    state === 'open'
      ? t('office.countertops.edge.client_choosing')
      : current !== null
        ? current.name
        : t('office.countertops.edge.none');
  return (
    <section className={styles.edgeSection} data-testid="edge-profile-card" data-state={state}>
      <div className={styles.edgeHead}>
        <h3 className={styles.lbl}>{t('office.countertops.edge.title')}</h3>
        <span className={styles.edgeNote}>{t('office.countertops.edge.exposed_only')}</span>
      </div>
      <div className={styles.edgeCard}>
        <ProfileDrawing profile={state === 'open' ? null : current} size="large" />
        <div className={styles.edgeCardText}>
          <span className={styles.edgeName} data-testid="edge-profile-name">
            {heading}
          </span>
          {state === 'open' ? (
            <span className={styles.edgeSub}>
              {t('office.countertops.edge.offered_count', { count: offer!.choices.length })}
            </span>
          ) : null}
        </div>
        {state !== 'not_offered' ? (
          <span
            className={state === 'open' ? styles.edgeBadgeOpen : styles.edgeBadge}
            data-testid="edge-profile-state"
          >
            {t(state === 'open' ? 'office.countertops.edge.state_open' : 'office.countertops.edge.state_chosen')}
          </span>
        ) : null}
      </div>
      {canEdit && profiles !== null ? (
        <label className={styles.edgePick}>
          <span>{t('office.countertops.edge.pick')}</span>
          <select
            className={styles.edgeSelect}
            data-testid="edge-profile-select"
            value={current?.id ?? ''}
            onChange={(e) => {
              if (e.target.value !== '') onPick(e.target.value);
            }}
          >
            {current === null ? <option value="">{t('office.countertops.edge.pick_placeholder')}</option> : null}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {offer !== null ? (
        <div className={styles.offered}>
          <h4 className={styles.offeredTitle}>{t('office.countertops.edge.offered')}</h4>
          <ul className={styles.offeredList}>
            {offer.choices.map((c) => {
              const p = byId(c.profileId);
              const price =
                !canSeePrices || c.ratePerLf === undefined
                  ? null
                  : c.ratePerLf === 0
                    ? t('office.countertops.edge.included')
                    : t('office.countertops.edge.total', {
                        amount: formatDollars(edgeOfferTotal(c.ratePerLf, piece)),
                      });
              return (
                <li key={c.profileId} className={styles.offeredRow} data-testid="edge-offered-row" data-id={c.profileId}>
                  <ProfileDrawing profile={p} />
                  <span className={styles.offeredName}>{p?.name ?? ''}</span>
                  {price !== null ? (
                    <span className={styles.offeredPrice} data-testid="edge-offered-price">
                      {price}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
