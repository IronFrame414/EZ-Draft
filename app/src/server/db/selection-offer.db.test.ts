// EZD-417 (03c selection_offer "project_id, kind (edge_profile, option group, finish), choices[], price_deltas";
// S04b Controls "Edit offered edges | Choose which profiles the client sees and enter the price difference per lf;
// the client sees the total | Requires Send to client", "Offered profile rows | ... price per lf × exposed edge length
// | Price hidden without See sell prices"; S04b Events emitted "edge_profile.offered"; 13b R2; AC-EZD-417-1;
// CLAUDE.md rule 4). Expected values: the offer keeps the profiles and rates entered; the island of board S04b
// (76 1/2 x 37 1/2, every side exposed, 228" = 19 LF) at $12/LF totals $228; one company never reads or changes
// another's offers; rates leave the server only with See sell prices.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { edgeOfferTotal, type CountertopPieceData } from '@ezdraft/geometry';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from './database.types';
import { listEdgeOffers, saveEdgeOffer } from '../countertops/edge-profiles';

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

const ISLAND: CountertopPieceData = {
  geometry: {
    outline: [
      { x: 0, y: 0 },
      { x: 76.5, y: 0 },
      { x: 76.5, y: 37.5 },
      { x: 0, y: 37.5 },
    ],
  },
  status: 'new',
  level: '34234c39-7f4e-4f09-8b77-92e9c457f84b',
  attributes: {
    label: 'C',
    name: 'Island',
    materialItemId: null,
    thickness: 1.1811,
    edges: (['exposed', 'exposed', 'seating', 'exposed'] as const).map((kind) => ({
      kind,
      overhang: kind === 'seating' ? 12 : 1.5,
      backsplashHeight: null,
      profileId: null,
    })),
  },
};

async function profiles(tenantId: string): Promise<Record<string, string>> {
  await harnessSql()`select private.seed_edge_profiles(${tenantId}::uuid)`;
  const rows = await harnessSql()<{ key: string; id: string }[]>`
    select key, id::text from public.edge_profile where tenant_id = ${tenantId}::uuid`;
  return Object.fromEntries(rows.map((r) => [r.key, r.id]));
}

describe('EZD-417 selection_offer (database)', () => {
  let tenant = '';
  let otherTenant = '';
  let projects: string[] = [];
  let otherProject = '';
  let own: Record<string, string> = {};
  let theirs: Record<string, string> = {};
  let sender: Session;
  let noSell: Session;
  let viewer: Session;
  let listed: Session;
  let other: Session;
  let senderId = '';

  beforeAll(async () => {
    tenant = await createTenant();
    otherTenant = await createTenant();
    projects = await createProjects(tenant, 2);
    [otherProject] = await createProjects(otherTenant, 1);
    own = await profiles(tenant);
    theirs = await profiles(otherTenant);

    const a = await createMember({ tenantId: tenant, scope: 'all' });
    senderId = a.appUserId;
    await setPermissions(tenant, a.membershipId, ['view_projects', 'send_to_client', 'see_sell_prices']);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, ['view_projects', 'send_to_client']);
    const c = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, c.membershipId, ['view_projects', 'edit_model', 'see_sell_prices']);
    const d = await createMember({ tenantId: tenant, scope: 'listed', listed: [projects[1]!] });
    await setPermissions(tenant, d.membershipId, ['view_projects', 'send_to_client', 'see_sell_prices']);
    const o = await createMember({ tenantId: otherTenant, scope: 'all' });
    await setPermissions(otherTenant, o.membershipId, ['view_projects', 'send_to_client', 'see_sell_prices']);
    sender = await signIn(a.email);
    noSell = await signIn(b.email);
    viewer = await signIn(c.email);
    listed = await signIn(d.email);
    other = await signIn(o.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('selection_offer', {
    makeRow: (t, ctx) => ({
      tenant_id: t,
      project_id: ctx.projectIds[0],
      kind: 'edge_profile',
      subject_id: randomUUID(),
      choices: [randomUUID()],
      price_deltas: [5],
    }),
    update: { status: 'chosen' },
  });

  it('AC-EZD-417-1 an offer keeps each rate, and rate × exposed LF of the island is the total', async () => {
    const piece = randomUUID();
    const r = await saveEdgeOffer(
      db(sender),
      {
        projectId: projects[0]!,
        pieceId: piece,
        choices: [
          { profileId: own.eased!, ratePerLf: 0 },
          { profileId: own.half_bullnose!, ratePerLf: 12 },
          { profileId: own.ogee!, ratePerLf: 18.5 },
        ],
      },
      true,
    );
    expect(r.ok).toBe(true);
    const offers = (await listEdgeOffers(db(sender), projects[0]!, true))!;
    const offer = offers.find((o) => o.pieceId === piece)!;
    expect(offer.status).toBe('open');
    expect(offer.choices).toEqual([
      { profileId: own.eased, ratePerLf: 0 },
      { profileId: own.half_bullnose, ratePerLf: 12 },
      { profileId: own.ogee, ratePerLf: 18.5 },
    ]);
    expect(offer.choices.map((c) => edgeOfferTotal(c.ratePerLf!, ISLAND))).toEqual([0, 228, 351.5]);
  });

  it('writes edge_profile.offered with ids only', async () => {
    const piece = randomUUID();
    const r = await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.bevel!, ratePerLf: 7.25 }] },
      true,
    );
    if (!r.ok || r.offer === null) throw new Error('save failed');
    const rows = await harnessSql()<{ actor: string; object_type: string; details: Record<string, unknown> }[]>`
      select actor_app_user_id::text as actor, object_type, details from public.event_log
      where action = 'edge_profile.offered' and object_id = ${r.offer.id}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe(senderId);
    expect(rows[0]!.object_type).toBe('selection_offer');
    expect(rows[0]!.details).toEqual({ projectId: projects[0], pieceId: piece, choices: [own.bevel] });
    expect(JSON.stringify(rows[0]!.details)).not.toContain('7.25');
  });

  it('a second save replaces the offer of that top; an empty list withdraws it', async () => {
    const piece = randomUUID();
    await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.eased!, ratePerLf: 0 }] },
      true,
    );
    await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.ogee!, ratePerLf: 20 }] },
      true,
    );
    const rows = await harnessSql()<{ choices: string[] }[]>`
      select choices::text[] from public.selection_offer where subject_id = ${piece}::uuid`;
    expect(rows).toEqual([{ choices: [own.ogee] }]);
    const gone = await saveEdgeOffer(db(sender), { projectId: projects[0]!, pieceId: piece, choices: [] }, true);
    expect(gone).toEqual({ ok: true, offer: null });
    const after = await harnessSql()`select 1 from public.selection_offer where subject_id = ${piece}::uuid`;
    expect(after).toHaveLength(0);
  });

  it('without See sell prices no rate goes out, saved rates are kept and a new choice gets 0', async () => {
    const piece = randomUUID();
    await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.ogee!, ratePerLf: 20 }] },
      true,
    );
    const r = await saveEdgeOffer(
      db(noSell),
      {
        projectId: projects[0]!,
        pieceId: piece,
        choices: [{ profileId: own.ogee!, ratePerLf: 1 }, { profileId: own.bevel!, ratePerLf: 1 }],
      },
      false,
    );
    expect(r.ok && r.offer?.choices).toEqual([{ profileId: own.ogee }, { profileId: own.bevel }]);
    const [row] = await harnessSql()<{ price_deltas: string[] }[]>`
      select price_deltas::text[] from public.selection_offer where subject_id = ${piece}::uuid`;
    expect(row!.price_deltas).toEqual(['20.00', '0.00']);
    const read = (await listEdgeOffers(db(noSell), projects[0]!, false))!;
    for (const o of read) for (const c of o.choices) expect(c).not.toHaveProperty('ratePerLf');
  });

  it('needs Send to client and the project in scope', async () => {
    const body = { pieceId: randomUUID(), choices: [{ profileId: own.eased!, ratePerLf: 0 }] };
    expect(await saveEdgeOffer(db(viewer), { projectId: projects[0]!, ...body }, true)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await saveEdgeOffer(db(listed), { projectId: projects[0]!, ...body }, true)).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect((await saveEdgeOffer(db(listed), { projectId: projects[1]!, ...body }, true)).ok).toBe(true);
  });

  it('refuses a profile not in the library, a repeated profile and a bad rate', async () => {
    const pieceId = randomUUID();
    const bad = async (choices: { profileId: string; ratePerLf?: number }[]) =>
      saveEdgeOffer(db(sender), { projectId: projects[0]!, pieceId, choices }, true);
    expect(await bad([{ profileId: randomUUID(), ratePerLf: 1 }])).toEqual({ ok: false, code: 'invalid_input' });
    expect(await bad([{ profileId: own.eased!, ratePerLf: 1 }, { profileId: own.eased!, ratePerLf: 2 }])).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(await bad([{ profileId: own.eased!, ratePerLf: -1 }])).toEqual({ ok: false, code: 'invalid_input' });
    expect(await bad([{ profileId: own.eased!, ratePerLf: 1.005 }])).toEqual({ ok: false, code: 'invalid_input' });
  });

  it("one company cannot read another company's offers", async () => {
    const piece = randomUUID();
    await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.eased!, ratePerLf: 3 }] },
      true,
    );
    expect(await listEdgeOffers(db(other), projects[0]!, true)).toBeNull();
    const direct = await other.serverDb.from('selection_offer').select('id').eq('subject_id', piece);
    expect(direct.data ?? []).toEqual([]);
  });

  it("one company cannot write another company's offers, nor offer another company's profile", async () => {
    const piece = randomUUID();
    await saveEdgeOffer(
      db(sender),
      { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: own.eased!, ratePerLf: 3 }] },
      true,
    );
    // Through the function: their project is not found; my project with their profile is refused.
    expect(
      await saveEdgeOffer(
        db(other),
        { projectId: projects[0]!, pieceId: piece, choices: [{ profileId: theirs.eased!, ratePerLf: 99 }] },
        true,
      ),
    ).toEqual({ ok: false, code: 'project_not_found' });
    expect(
      await saveEdgeOffer(
        db(sender),
        { projectId: projects[0]!, pieceId: randomUUID(), choices: [{ profileId: theirs.eased!, ratePerLf: 1 }] },
        true,
      ),
    ).toEqual({ ok: false, code: 'invalid_input' });
    // Directly: no update, delete or insert reaches the table.
    const upd = await other.serverDb.from('selection_offer').update({ status: 'chosen' }).eq('subject_id', piece).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await other.serverDb.from('selection_offer').delete().eq('subject_id', piece).select();
    expect(del.data ?? []).toEqual([]);
    const ins = await other.serverDb.from('selection_offer').insert({
      tenant_id: tenant,
      project_id: projects[0]!,
      kind: 'edge_profile',
      subject_id: randomUUID(),
      choices: [own.eased!],
      price_deltas: [1],
    });
    expect(ins.error?.code).toBe('42501');
    const [row] = await harnessSql()<{ status: string; price_deltas: string[] }[]>`
      select status, price_deltas::text[] from public.selection_offer where subject_id = ${piece}::uuid`;
    expect(row).toEqual({ status: 'open', price_deltas: ['3.00'] });
    // Their own project is theirs alone: my sender cannot reach it either.
    expect(
      await saveEdgeOffer(
        db(sender),
        { projectId: otherProject, pieceId: randomUUID(), choices: [{ profileId: own.eased!, ratePerLf: 1 }] },
        true,
      ),
    ).toEqual({ ok: false, code: 'project_not_found' });
  });

  it('a member of the same company writes no offer directly (only through Edit offered edges)', async () => {
    const ins = await sender.serverDb.from('selection_offer').insert({
      tenant_id: tenant,
      project_id: projects[0]!,
      kind: 'edge_profile',
      subject_id: randomUUID(),
      choices: [own.eased!],
      price_deltas: [1],
    });
    expect(ins.error?.code).toBe('42501');
  });

  it('the browser client without the gate header reads nothing', async () => {
    const r = await sender.browserDb.from('selection_offer').select('id');
    expect(r.data ?? []).toEqual([]);
  });
});
