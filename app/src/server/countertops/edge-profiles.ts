// EZD-417 (03c edge_profile, selection_offer; S04b Permissions "See sell prices: price differences in the offered
// list", "Send to client: Edit offered edges"; 13b R2; supabase/migrations/20261122160000_edge_profile.sql and 20261122160100_selection_offer.sql):
// the edge profile library and a project's edge offers, read under the member's session (RLS: company and project
// scope). Rates are sell prices: they leave here only when the caller says the member holds See sell prices.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type { EdgeOffer, EdgeProfile } from '../../editor/countertops/edge-profile';

type Db = SupabaseClient<Database>;

// The company library in order; a company's first read seeds the seven profiles (edge_profile_library).
export async function listEdgeProfiles(db: Db): Promise<EdgeProfile[]> {
  const { data, error } = await db.rpc('edge_profile_library');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, sectionSvg: r.section_svg }));
}

type OfferRow = {
  id: string;
  subject_id: string;
  choices: string[];
  price_deltas: number[] | string[];
  status: string;
};

function toOffer(r: OfferRow, withRates: boolean): EdgeOffer {
  return {
    id: r.id,
    pieceId: r.subject_id,
    status: r.status === 'chosen' ? 'chosen' : 'open',
    choices: r.choices.map((profileId, i) =>
      withRates ? { profileId, ratePerLf: Number(r.price_deltas[i] ?? 0) } : { profileId },
    ),
  };
}

// null when the project is not one the member can see (another company's, or out of scope).
export async function listEdgeOffers(
  db: Db,
  projectId: string,
  withRates: boolean,
): Promise<EdgeOffer[] | null> {
  const project = await db.from('project').select('id').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  // The rates are read only for a member who may see them.
  const columns = withRates ? 'id, subject_id, choices, price_deltas, status' : 'id, subject_id, choices, status';
  const { data, error } = await db
    .from('selection_offer')
    .select(columns)
    .eq('project_id', projectId)
    .eq('kind', 'edge_profile')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as OfferRow[]).map((r) => toOffer({ ...r, price_deltas: r.price_deltas ?? [] }, withRates));
}

export type SaveEdgeOfferInput = {
  projectId: string;
  pieceId: string;
  choices: ReadonlyArray<{ profileId: string; ratePerLf?: number }>;
};

export type SaveEdgeOfferResult =
  | { ok: true; offer: EdgeOffer | null }
  | { ok: false; code: 'permission_denied' | 'project_not_found' | 'invalid_input' };

// Edit offered edges through save_edge_offer (definer: Send to client and project scope again). Without See sell
// prices no rate is sent: the function keeps the saved rates and enters 0 for a new choice.
export async function saveEdgeOffer(
  db: Db,
  input: SaveEdgeOfferInput,
  withRates: boolean,
): Promise<SaveEdgeOfferResult> {
  const { data, error } = await db.rpc('save_edge_offer', {
    p_project: input.projectId,
    p_piece: input.pieceId,
    p_choices: input.choices.map((c) => c.profileId),
    ...(withRates ? { p_rates: input.choices.map((c) => c.ratePerLf ?? 0) } : {}),
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const offer = (data as { offer: OfferRow | null }).offer;
  return { ok: true, offer: offer === null ? null : toOffer(offer, withRates) };
}
