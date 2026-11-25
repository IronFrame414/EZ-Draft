// EZD-417 (S04b Controls "Edge profile card | Pick profile from library ... | Applied to exposed edges only",
// "Offered profile rows", "Edit offered edges", "Edge profile status pill ("Edge profile: client choosing") | Shows
// Open, Chosen states"; S04b States "Edge profile open (client choosing), chosen, or not offered"; AC-EZD-417-1;
// vault/build/assumptions.md EZD-417): the edge profile library, a project's edge offers and the model change that
// puts a profile on a top. The change is pure; the loads call the EZD-417 routes.
import { countertopPieceProfileId, withEdgeProfile } from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import { sameId } from '../shared/ids';
import { countertopChange, type CountertopPiece } from './trace-tool';

export type EdgeProfile = { id: string; key: string; name: string; sectionSvg: string };

// One offered profile. `ratePerLf` (dollars per LF, a sell price) is there only for a member with See sell prices.
export type EdgeOfferChoice = { profileId: string; ratePerLf?: number };
export type EdgeOffer = {
  id: string;
  pieceId: string;
  status: 'open' | 'chosen';
  choices: EdgeOfferChoice[];
};

// The pill and card state of a top (S04b States).
export type EdgeOfferState = 'not_offered' | 'open' | 'chosen';

export function offerFor(offers: readonly EdgeOffer[] | null, pieceId: string): EdgeOffer | null {
  return offers?.find((o) => sameId(o.pieceId, pieceId)) ?? null;
}

export function edgeOfferState(offer: EdgeOffer | null): EdgeOfferState {
  return offer === null ? 'not_offered' : offer.status;
}

// The canvas pill over the tops shown: the selected top's state; with no top selected, client choosing when any top
// is open, else chosen when any is chosen, else not offered.
export function edgeOfferPillState(
  offers: readonly EdgeOffer[] | null,
  pieceIds: readonly string[],
  selected: string | null,
): EdgeOfferState {
  if (selected !== null) return edgeOfferState(offerFor(offers, selected));
  const states = pieceIds.map((id) => edgeOfferState(offerFor(offers, id)));
  if (states.includes('open')) return 'open';
  if (states.includes('chosen')) return 'chosen';
  return 'not_offered';
}

// The change that puts `profileId` on every exposed edge of the top; [] when the top is not shown or already has it.
export function edgeProfileChanges(
  pieces: readonly CountertopPiece[],
  pieceId: string,
  profileId: string,
): Change[] {
  const p = pieces.find((q) => sameId(q.id, pieceId));
  if (p === undefined) return [];
  const current = countertopPieceProfileId(p.data);
  if (current !== null && sameId(current, profileId)) return [];
  return [countertopChange(p.id, withEdgeProfile(p.data, profileId))];
}

export type EdgeProfilesLoad = () => Promise<readonly EdgeProfile[]>;
export type EdgeOffersLoad = (projectId: string) => Promise<readonly EdgeOffer[]>;
export type EdgeOfferSave = (
  projectId: string,
  body: { pieceId: string; choices: EdgeOfferChoice[] },
) => Promise<EdgeOffer | null>;

export const fetchEdgeProfiles: EdgeProfilesLoad = async () => {
  const res = await fetch('/api/edge-profiles', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status !== 200) throw new Error('edge_profiles_load_failed');
  return ((await res.json()) as { profiles: EdgeProfile[] }).profiles;
};

export const fetchEdgeOffers: EdgeOffersLoad = async (projectId) => {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/edge-offer`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (res.status !== 200) throw new Error('edge_offers_load_failed');
  return ((await res.json()) as { offers: EdgeOffer[] }).offers;
};

export const putEdgeOffer: EdgeOfferSave = async (projectId, body) => {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/edge-offer`, {
    method: 'PUT',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new Error('edge_offer_save_failed');
  return ((await res.json()) as { offer: EdgeOffer | null }).offer;
};
