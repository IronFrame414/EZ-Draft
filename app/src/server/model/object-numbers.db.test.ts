// EZD-294 R1-R9 (vault/plans/EZD-294.md section 4; Decided "loadModel numbers", "Number trigger", "Saved number",
// "Backfill"; Q-0625 (a); Q-0629 (b); AC-EZD-294-1, -2). Local database, real sign-in (as load-model.db.test.ts, L-051).
// Admin rows set updated_seq >= 1 and a live non-floor `data.level` = the project's first floor.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpeningData, createWallData, CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import { loadModel, saveObjects, type ObjectChange } from './model';

type Rec = Record<string, unknown>;
const EDITOR: readonly PermissionKey[] = ['view_projects', 'edit_model'];

const ctxOf = (m: Member): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set<PermissionKey>(EDITOR),
  listedProjectIds: new Set<string>(),
});
const dbOf = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

type Who = { member: Member; session: Session };
async function editor(tenant: string): Promise<Who> {
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [...EDITOR]);
  return { member, session: await signIn(member.email) };
}

const floorOf = async (project: string): Promise<string> => {
  const [first] = await harnessSql()<{ object_id: string }[]>`
    select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
  return first.object_id;
};

const at = (n: number) => ({ x: n, y: 0 });
function wallData(level: string, n: number, number?: number): Rec {
  const r = createWallData({ start: at(n * 10), end: at(n * 10 + 120), level });
  if (!r.ok) throw new Error('createWallData refused the test wall');
  const data = r.data as unknown as { attributes: Rec };
  return number === undefined
    ? (data as unknown as Rec)
    : { ...data, attributes: { ...data.attributes, number } };
}
function openingData(level: string, kind: 'door' | 'window', number?: number): Rec {
  const w = createWallData({ start: at(0), end: at(120), level });
  if (!w.ok) throw new Error('createWallData refused the test wall');
  const d = createOpeningData({
    kind,
    host: { id: randomUUID(), type: 'wall', data: w.data },
    center: { x: 60, y: 0 },
  });
  return {
    ...d,
    geometry: { ...d.geometry, hostWallId: null },
    status: 'new',
    attributes: { ...d.attributes, ...(number === undefined ? {} : { number }) },
  };
}
const roomData = (level: string): Rec => ({
  geometry: { boundary: [at(0), at(144), { x: 144, y: 120 }, { x: 0, y: 120 }] },
  status: 'existing',
  level,
  attributes: { name: 'Room 1', floorLevel: 0, photos: [] },
  closureOverride: null,
});

const upsert = (id: string, type: string, data: Rec, baseSeq = 0): ObjectChange => ({
  id,
  baseSeq,
  deleted: false,
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});
const removal = (id: string, baseSeq: number): ObjectChange => ({ id, baseSeq, deleted: true });

async function save(w: Who, project: string, changes: ObjectChange[]) {
  const r = await saveObjects(
    dbOf(w.session),
    project,
    { lockEpoch: 0, changes },
    w.member.appUserId,
  );
  if (!r.ok) throw new Error(`save refused: ${r.code}`);
  return r.objects as { id: string; updatedSeq: number; number?: number }[];
}
const numberOfAnswer = (answer: { id: string; number?: number }[], id: string) =>
  answer.find((o) => o.id === id)?.number;

const storedAttrs = async (project: string, id: string): Promise<Rec> => {
  const [row] = await harnessSql()<{ data: { attributes: Rec } }[]>`
    select data from public.model_object where project_id = ${project}::uuid and object_id = ${id}::uuid`;
  return row.data.attributes;
};

const insertRow = async (
  project: string,
  tenant: string,
  id: string,
  type: string,
  data: unknown,
  deleted: boolean,
) => {
  const sql = harnessSql();
  await sql`insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
    values (${project}::uuid, ${id}::uuid, ${tenant}::uuid, ${type}, ${sql.json(data as never)},
      ${CURRENT_SCHEMA_VERSION}, 1, ${deleted})`;
};

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-294 object numbers (database)', () => {
  let tenant = '';
  let a: Who;
  let b: Who;

  beforeAll(async () => {
    tenant = await createTenant();
    a = await editor(tenant);
    b = await editor(tenant);
  }, 180000);

  it('EZD-294 R1 the load counts live and deleted numbers of its own project', async () => {
    const [pa, pb, pc] = await createProjects(tenant, 3);
    const fa = await floorOf(pa);
    const fb = await floorOf(pb);
    await insertRow(pa, tenant, randomUUID(), 'wall', wallData(fa, 1, 1), false);
    await insertRow(pa, tenant, randomUUID(), 'wall', wallData(fa, 2, 2), false);
    await insertRow(pa, tenant, randomUUID(), 'wall', wallData(fa, 3, 3), true);
    await insertRow(pa, tenant, randomUUID(), 'opening', openingData(fa, 'door', 2), false);
    await insertRow(pa, tenant, randomUUID(), 'opening', openingData(fa, 'window', 4), true);
    await insertRow(pa, tenant, randomUUID(), 'room', roomData(fa), false);
    await insertRow(pb, tenant, randomUUID(), 'wall', wallData(fb, 1, 50), true);

    const loadA = await loadModel(dbOf(a.session), pa, ctxOf(a.member));
    expect(loadA?.numberHighs).toEqual({ wall: 3, door: 2, window: 4 });
    const loadC = await loadModel(dbOf(a.session), pc, ctxOf(a.member));
    expect(loadC?.numberHighs).toEqual({ wall: 0, door: 0, window: 0 });
  }, 120000);

  it('EZD-294 R2 deleted rows are paged', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    await harnessSql()`insert into public.model_object
      (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
      select ${p}::uuid, ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid, ${tenant}::uuid,
        'wall', jsonb_build_object('level', ${floor}::text, 'attributes', jsonb_build_object('number', g)),
        ${CURRENT_SCHEMA_VERSION}, 1, true
      from generate_series(1, 1001) g`;
    const load = await loadModel(dbOf(a.session), p, ctxOf(a.member));
    expect(load?.numberHighs.wall).toBe(1001);
  }, 120000);

  it('EZD-294 R3 the number is the same on every device', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const id = randomUUID();
    await save(a, p, [upsert(id, 'wall', wallData(floor, 1, 4))]);
    const load = await loadModel(dbOf(b.session), p, ctxOf(b.member));
    const wall = load?.objects.find((o) => o.id === id);
    expect((wall?.data.attributes as Rec).number).toBe(4);
  }, 120000);

  it('EZD-294 R4 a stored number never changes on update', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const wall = randomUUID();
    await save(a, p, [upsert(wall, 'wall', wallData(floor, 1, 4))]);
    await save(a, p, [upsert(wall, 'wall', wallData(floor, 2), 1)]);
    expect((await storedAttrs(p, wall)).number).toBe(4);
    await save(a, p, [upsert(wall, 'wall', wallData(floor, 3, 9), 2)]);
    expect((await storedAttrs(p, wall)).number).toBe(4);

    const opening = randomUUID();
    await save(a, p, [upsert(opening, 'opening', openingData(floor, 'door', 2))]);
    expect((await storedAttrs(p, opening)).number).toBe(2);
    await save(a, p, [upsert(opening, 'opening', openingData(floor, 'window', 1), 1)]);
    const stored = await storedAttrs(p, opening);
    expect(stored.kind).toBe('window');
    expect(stored.number).toBe(1);
  }, 120000);

  it('EZD-294 R6 two devices that send the same new number get different numbers', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const [wa, wb, wc, wd, we] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const first = await save(a, p, [upsert(wa, 'wall', wallData(floor, 1, 5))]);
    expect(numberOfAnswer(first, wa)).toBe(5);
    const second = await save(b, p, [upsert(wb, 'wall', wallData(floor, 2, 5))]);
    expect(numberOfAnswer(second, wb)).toBe(6);
    const both = await save(b, p, [
      upsert(wc, 'wall', wallData(floor, 3, 7)),
      upsert(wd, 'wall', wallData(floor, 4, 7)),
    ]);
    expect(
      [numberOfAnswer(both, wc), numberOfAnswer(both, wd)].sort((x, y) => (x ?? 0) - (y ?? 0)),
    ).toEqual([7, 8]);
    await save(a, p, [removal(wa, 1)]);
    const last = await save(b, p, [upsert(we, 'wall', wallData(floor, 5, 5))]);
    expect(numberOfAnswer(last, we)).toBe(9);

    expect((await storedAttrs(p, wa)).number).toBe(5);
    expect((await storedAttrs(p, wb)).number).toBe(6);
    expect(
      [
        (await storedAttrs(p, wc)).number as number,
        (await storedAttrs(p, wd)).number as number,
      ].sort((x, y) => x - y),
    ).toEqual([7, 8]);
    expect((await storedAttrs(p, we)).number).toBe(9);
  }, 120000);

  it('EZD-294 R7 a new wall or opening sent without a number gets the next one', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const [w1, d1, w2, r1] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    expect(numberOfAnswer(await save(a, p, [upsert(w1, 'wall', wallData(floor, 1))]), w1)).toBe(1);
    expect(
      numberOfAnswer(await save(a, p, [upsert(d1, 'opening', openingData(floor, 'door'))]), d1),
    ).toBe(1);
    const room = roomData(floor);
    const answer = await save(a, p, [
      upsert(w2, 'wall', wallData(floor, 2)),
      upsert(r1, 'room', room),
    ]);
    expect(numberOfAnswer(answer, w2)).toBe(2);
    const roomEntry = answer.find((o) => o.id === r1);
    expect(roomEntry).toBeDefined();
    expect('number' in (roomEntry as object)).toBe(false);
    const [stored] = await harnessSql()<{ data: unknown }[]>`
      select data from public.model_object where project_id = ${p}::uuid and object_id = ${r1}::uuid`;
    expect(stored.data).toEqual(room);
  }, 120000);

  it('EZD-294 R8 a sent number above 2147483647 is renumbered', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const [w, wa, wc, wb, wd] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const one = async (id: string, n: number, number?: number) =>
      numberOfAnswer(await save(a, p, [upsert(id, 'wall', wallData(floor, n, number))]), id);
    expect(await one(w, 1, 3)).toBe(3);
    await insertRow(p, tenant, wa, 'wall', wallData(floor, 2, 2 ** 53 - 1), false);
    await insertRow(p, tenant, wc, 'wall', wallData(floor, 3, 2147483648), false);
    expect(await one(wb, 4)).toBe(6);
    expect(await one(wd, 5, 2147483647)).toBe(2147483647);

    expect((await storedAttrs(p, w)).number).toBe(3);
    expect((await storedAttrs(p, wa)).number).toBe(4);
    expect((await storedAttrs(p, wc)).number).toBe(5);
    expect((await storedAttrs(p, wb)).number).toBe(6);
    expect((await storedAttrs(p, wd)).number).toBe(2147483647);
    const load = await loadModel(dbOf(a.session), p, ctxOf(a.member));
    expect(load?.numberHighs.wall).toBe(2147483647);
  }, 120000);

  it('EZD-294 R5 the backfill numbers earlier rows once, in save order', async () => {
    const [pp, pq] = await createProjects(tenant, 2);
    const fp = await floorOf(pp);
    const fq = await floorOf(pq);
    const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
    const [w3, w1, w2, w4, door, win, room, q] = [
      id(3),
      id(1),
      id(2),
      id(4),
      id(5),
      id(6),
      id(7),
      id(8),
    ];
    const sql = harnessSql();
    await sql.begin(async (tx) => {
      await tx`set constraints all immediate`;
      await tx`alter table public.model_object disable trigger model_object_number`;
      const add = (
        project: string,
        objectId: string,
        type: string,
        data: unknown,
        del: boolean,
        at: string,
      ) =>
        tx`insert into public.model_object
          (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted, created_at)
          values (${project}::uuid, ${objectId}::uuid, ${tenant}::uuid, ${type}, ${tx.json(data as never)},
            ${CURRENT_SCHEMA_VERSION}, 3, ${del}, ${at}::timestamptz)`;
      await add(pp, w3, 'wall', wallData(fp, 3), false, '2026-01-01T00:00:00Z');
      await add(pp, w1, 'wall', wallData(fp, 1), true, '2026-01-02T00:00:00Z');
      await add(pp, w2, 'wall', wallData(fp, 2), false, '2026-01-02T00:00:00Z');
      await add(pp, w4, 'wall', wallData(fp, 4, 5), false, '2026-01-03T00:00:00Z');
      await add(pp, door, 'opening', openingData(fp, 'door'), false, '2026-01-03T00:00:00Z');
      await add(pp, win, 'opening', openingData(fp, 'window'), false, '2026-01-03T00:00:00Z');
      await add(pp, room, 'room', roomData(fp), false, '2026-01-03T00:00:00Z');
      await add(pq, q, 'wall', wallData(fq, 1), false, '2026-01-01T00:00:00Z');
      await tx`set constraints all immediate`;
      await tx`alter table public.model_object enable trigger model_object_number`;
    });
    const before = await sql<{ object_id: string; updated_seq: number; data: unknown }[]>`
      select object_id, updated_seq, data from public.model_object where project_id = ${pp}::uuid`;
    const first = await sql<
      { n: number }[]
    >`select private.backfill_object_numbers(${pp}::uuid) as n`;
    expect(first[0].n).toBe(5);
    const numberOf = async (project: string, objectId: string) =>
      (await storedAttrs(project, objectId)).number;
    expect(await numberOf(pp, w3)).toBe(6);
    expect(await numberOf(pp, w1)).toBe(7);
    expect(await numberOf(pp, w2)).toBe(8);
    expect(await numberOf(pp, w4)).toBe(5);
    expect(await numberOf(pp, door)).toBe(1);
    expect(await numberOf(pp, win)).toBe(1);
    expect(await numberOf(pp, room)).toBeUndefined();
    const roomAfter = await sql<{ data: unknown }[]>`
      select data from public.model_object where project_id = ${pp}::uuid and object_id = ${room}::uuid`;
    expect(roomAfter[0].data).toEqual(before.find((r) => r.object_id === room)?.data);
    const after = await sql<{ object_id: string; updated_seq: number }[]>`
      select object_id, updated_seq from public.model_object where project_id = ${pp}::uuid`;
    const seqOf = (rows: { object_id: string; updated_seq: number }[]) =>
      new Map(rows.map((r) => [r.object_id, r.updated_seq]));
    expect(seqOf(after)).toEqual(seqOf(before));
    const second = await sql<
      { n: number }[]
    >`select private.backfill_object_numbers(${pp}::uuid) as n`;
    expect(second[0].n).toBe(0);
    expect(await numberOf(pq, q)).toBeUndefined();
  }, 120000);

  it('EZD-294 R9 the backfill renumbers a stored number above 2147483647', async () => {
    const [p] = await createProjects(tenant, 1);
    const floor = await floorOf(p);
    const [wa, wb, wc, wd, we] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const sql = harnessSql();
    await sql.begin(async (tx) => {
      await tx`set constraints all immediate`;
      await tx`alter table public.model_object disable trigger model_object_number`;
      const add = (objectId: string, data: unknown, at: string) =>
        tx`insert into public.model_object
          (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted, created_at)
          values (${p}::uuid, ${objectId}::uuid, ${tenant}::uuid, 'wall', ${tx.json(data as never)},
            ${CURRENT_SCHEMA_VERSION}, 3, false, ${at}::timestamptz)`;
      await add(wa, wallData(floor, 1, 2 ** 53 - 1), '2026-01-01T00:00:00Z');
      await add(wb, wallData(floor, 2, 4), '2026-01-02T00:00:00Z');
      await add(wc, wallData(floor, 3, 2147483648), '2026-01-03T00:00:00Z');
      await add(wd, wallData(floor, 4), '2026-01-04T00:00:00Z');
      await tx`set constraints all immediate`;
      await tx`alter table public.model_object enable trigger model_object_number`;
    });
    const first = await sql<
      { n: number }[]
    >`select private.backfill_object_numbers(${p}::uuid) as n`;
    expect(first[0].n).toBe(3);
    expect((await storedAttrs(p, wa)).number).toBe(5);
    expect((await storedAttrs(p, wb)).number).toBe(4);
    expect((await storedAttrs(p, wc)).number).toBe(6);
    expect((await storedAttrs(p, wd)).number).toBe(7);
    const second = await sql<
      { n: number }[]
    >`select private.backfill_object_numbers(${p}::uuid) as n`;
    expect(second[0].n).toBe(0);
    const answer = await save(a, p, [upsert(we, 'wall', wallData(floor, 5))]);
    expect(numberOfAnswer(answer, we)).toBe(8);
    expect((await storedAttrs(p, we)).number).toBe(8);
    const load = await loadModel(dbOf(a.session), p, ctxOf(a.member));
    expect(load?.numberHighs.wall).toBe(8);
  }, 120000);
});

// EZD-366 D1-D4 (vault/plans/EZD-366.md sections 3 and 4; Decided "Recovery rule", "Sent number rule",
// "Update rule", "Deleted rows", "Migration contents"; D-099; AC-EZD-366-1, -2).
describe('EZD-366 a crafted number cannot stop new numbers (database)', () => {
  let tenant = '';
  let a: Who;

  beforeAll(async () => {
    tenant = await createTenant();
    a = await editor(tenant);
  }, 180000);

  async function oneProject() {
    const made = await createProjects(tenant, 1);
    const p = made.at(0) as string;
    return { p, floor: await floorOf(p) };
  }
  const wallSave = async (p: string, floor: string, id: string, n: number, number?: number) =>
    numberOfAnswer(await save(a, p, [upsert(id, 'wall', wallData(floor, n, number))]), id);

  it('EZD-366 D1 a wall sent as 2147483647 leaves the project able to take new walls', async () => {
    const { p, floor } = await oneProject();
    const id = {
      w1: randomUUID(),
      w2: randomUUID(),
      wx: randomUUID(),
      w3: randomUUID(),
      w4: randomUUID(),
      w5: randomUUID(),
      w6: randomUUID(),
      dx: randomUUID(),
      d1: randomUUID(),
    };
    expect(await wallSave(p, floor, id.w1, 1)).toBe(1);
    expect(await wallSave(p, floor, id.w2, 2)).toBe(2);
    expect(await wallSave(p, floor, id.wx, 3, 2147483647)).toBe(2147483647);
    expect(await wallSave(p, floor, id.w3, 4)).toBe(3);
    expect(await wallSave(p, floor, id.w4, 5, 2147483647)).toBe(4);
    const pair = await save(a, p, [
      upsert(id.w5, 'wall', wallData(floor, 6)),
      upsert(id.w6, 'wall', wallData(floor, 7)),
    ]);
    expect(
      [numberOfAnswer(pair, id.w5), numberOfAnswer(pair, id.w6)].sort(
        (x, y) => (x ?? 0) - (y ?? 0),
      ),
    ).toEqual([5, 6]);
    const dxAnswer = await save(a, p, [
      upsert(id.dx, 'opening', openingData(floor, 'door', 2147483647)),
    ]);
    expect(numberOfAnswer(dxAnswer, id.dx)).toBe(2147483647);
    const d1Answer = await save(a, p, [upsert(id.d1, 'opening', openingData(floor, 'door'))]);
    expect(numberOfAnswer(d1Answer, id.d1)).toBe(1);
    expect((await storedAttrs(p, id.wx)).number).toBe(2147483647);
    const load = await loadModel(dbOf(a.session), p, ctxOf(a.member));
    expect(load?.numberHighs).toEqual({ wall: 2147483647, door: 2147483647, window: 0 });
  }, 120000);

  it('EZD-366 D2 the free number counts deleted rows and skips used numbers', async () => {
    const { p, floor } = await oneProject();
    const id = {
      a1: randomUUID(),
      b3: randomUUID(),
      cx: randomUUID(),
      d: randomUUID(),
      e: randomUUID(),
      f6: randomUUID(),
      g: randomUUID(),
      h: randomUUID(),
    };
    expect(await wallSave(p, floor, id.a1, 1, 1)).toBe(1);
    expect(await wallSave(p, floor, id.b3, 2, 3)).toBe(3);
    expect(await wallSave(p, floor, id.cx, 3, 2147483647)).toBe(2147483647);
    await save(a, p, [removal(id.b3, 1)]);
    expect(await wallSave(p, floor, id.d, 4)).toBe(2);
    expect(await wallSave(p, floor, id.e, 5)).toBe(4);
    expect(await wallSave(p, floor, id.f6, 6, 6)).toBe(6);
    expect(await wallSave(p, floor, id.g, 7)).toBe(5);
    expect(await wallSave(p, floor, id.h, 8)).toBe(7);
  }, 120000);

  it('EZD-366 D3 existing numbers are unchanged', async () => {
    const { p, floor } = await oneProject();
    const id = { x1: randomUUID(), xx: randomUUID(), x2: randomUUID(), y: randomUUID() };
    expect(await wallSave(p, floor, id.x1, 1)).toBe(1);
    expect(await wallSave(p, floor, id.xx, 2, 2147483647)).toBe(2147483647);
    expect(await wallSave(p, floor, id.x2, 3)).toBe(2);
    const update = await save(a, p, [
      upsert(id.x1, 'wall', wallData(floor, 10, 9), 1),
      upsert(id.xx, 'wall', wallData(floor, 11), 1),
      upsert(id.x2, 'wall', wallData(floor, 12, 2147483647), 1),
    ]);
    expect(numberOfAnswer(update, id.x1)).toBe(1);
    expect(numberOfAnswer(update, id.xx)).toBe(2147483647);
    expect(numberOfAnswer(update, id.x2)).toBe(2);
    expect((await storedAttrs(p, id.x1)).number).toBe(1);
    expect((await storedAttrs(p, id.xx)).number).toBe(2147483647);
    expect((await storedAttrs(p, id.x2)).number).toBe(2);
    const refused = await saveObjects(
      dbOf(a.session),
      p,
      { lockEpoch: 0, changes: [upsert(id.y, 'wall', wallData(floor, 4, 2147483648))] },
      a.member.appUserId,
    );
    expect(refused).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: id.y, issue: 'invalid_data' }],
    });
    const rows = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.model_object
      where project_id = ${p}::uuid and object_id = ${id.y}::uuid`;
    expect(rows.at(0)?.n).toBe(0);
  }, 120000);

  it('EZD-366 D4 the migration renumbers no stored row', async () => {
    const { p, floor } = await oneProject();
    await wallSave(p, floor, randomUUID(), 1);
    await wallSave(p, floor, randomUUID(), 2, 2147483647);
    await wallSave(p, floor, randomUUID(), 3);
    await save(a, p, [upsert(randomUUID(), 'room', roomData(floor))]);
    const dir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'supabase',
      'migrations',
    );
    const files = readdirSync(dir).filter((f) => f.endsWith('_object_number_free_fallback.sql'));
    expect(files).toHaveLength(1);
    const text = readFileSync(path.join(dir, files.at(0) as string), 'utf8');
    const SENTINEL = 'EZD-366 D4 rollback';
    type Row = { object_id: string; data: unknown };
    const reads: Row[][] = [];
    try {
      await harnessSql().begin(async (tx) => {
        const read = () =>
          tx<Row[]>`
            select object_id, data from public.model_object
            where project_id = ${p}::uuid order by object_id`;
        reads.push(Array.from(await read()));
        await tx.unsafe(text);
        reads.push(Array.from(await read()));
        throw new Error(SENTINEL);
      });
    } catch (e) {
      expect((e as Error).message).toBe(SENTINEL);
    }
    expect(reads).toHaveLength(2);
    expect(reads.at(0)?.length).toBeGreaterThan(0);
    expect(reads.at(1)).toEqual(reads.at(0));
  }, 120000);
});
