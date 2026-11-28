// EZD-2032 AC-EZD-2032-1 to -4 against the local database: Send set to client (EZD-719) queues one
// client_sheet_images job; the job, run in-process (no live service), writes one image per sheet of the sent set at the
// frozen sent version under that sent package in Storage; a failed write is retried (Q-0059); the client page's
// Plans tab reads the sheets with signed links of at most SIGNED_DOWNLOAD_SECONDS for a live link only, and the
// storage policy refuses everyone else. Expected values:
//   - the default permit set of a kitchen project with one floor is A0.0 to R1.0 (the EZD-715 export test's list,
//     sheet set rules 09h; S13), in that order;
//   - images 2400 px on the long side and 400 px thumbnails (vault/build/assumptions/EZD-1205.md "Image size"); a
//     24x36 sheet is 3:2, so 2400 x 1600 and 400 x 267;
//   - a second floor saved after the send would add A1.1, A2.1 ... (09h floor copies); the images use the frozen
//     version, so they do not appear;
//   - a send with no sheet set, or one with no images job (a send made before EZD-2032), has no Plans tab.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../../test-harness/rls/fixtures';
import type { Database } from '../../db/database.types';
import { loadClientPage } from '../../sends/client-page';
import { loadClientSheets } from '../../sends/client-sheets';
import { sendToClient } from '../../sends/sends';
import { SIGNED_DOWNLOAD_SECONDS } from '../../storage/objects';
import { JobError } from '../errors';
import { getHandlers } from '../handlers';
import type { ClientSheetImagesResult } from './client-sheet-images';

// A switch the upload-failure test turns on: the jobs client's exports uploads fail while it is set.
const failing = vi.hoisted(() => ({ uploads: false }));
vi.mock('../db', async (importOriginal) => {
  const real = await importOriginal<typeof import('../db')>();
  return {
    createJobsDbClient: () => {
      const db = real.createJobsDbClient();
      const from = db.storage.from.bind(db.storage);
      db.storage.from = ((bucket: string) => {
        const api = from(bucket);
        if (!failing.uploads) return api;
        return Object.assign(Object.create(Object.getPrototypeOf(api)), api, {
          upload: async () => ({ data: null, error: { message: 'down', statusCode: '503' } }),
        });
      }) as typeof db.storage.from;
      return db;
    },
  };
});

const DEFAULT_PERMIT_SHEETS = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const signedOut = () => anonDb({ gate: true }) as unknown as SupabaseClient<Database>;

type Sent = { id: string; token: string };

describe('EZD-2032 client sheet images', () => {
  let release: () => Promise<void>;
  let tA = '';
  let tB = '';
  let pA = '';
  let pB = '';
  let sA: Session;
  let sB: Session;
  const kick = () => {};

  async function project(t: string, s: Session, name: string): Promise<string> {
    const made = await s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '336 Golfview Rd',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    if (made.error) throw made.error;
    const id = (made.data as { project_id: string }[])[0]!.project_id;
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${t}::uuid, 'Pat Hendricks', ${`pat-${randomUUID()}@example.test`}) returning id`;
    await sql`update public.project set customer_id = ${c!.id}::uuid where id = ${id}::uuid`;
    return id;
  }

  async function member(t: string): Promise<Session> {
    const m = await createMember({ tenantId: t, scope: 'all' });
    await setPermissions(t, m.membershipId, ['view_projects', 'edit_model', 'create_projects', 'send_to_client']);
    return signIn(m.email);
  }

  async function send(s: Session, projectId: string, withSet: boolean): Promise<Sent> {
    const r = await sendToClient(
      s.serverDb as unknown as SupabaseClient<Database>,
      { projectId, note: null, set: withSet ? { kind: 'permit', id: null } : null },
      { env: ENV, requestIp: async () => null, kick },
    );
    if (!r.ok) throw new Error(`send failed: ${r.code}`);
    return { id: r.send.id, token: r.send.link.split('/').pop() as string };
  }

  async function jobsOf(sentId: string) {
    return harnessSql()<{ id: string; tenant_id: string; project_id: string; payload: Record<string, unknown>; max_attempts: number; status: string }[]>`
      select id, tenant_id, project_id, payload, max_attempts, status from public.job
      where kind = 'client_sheet_images' and payload ->> 'sentPackageId' = ${sentId}`;
  }

  async function runJob(job: { id: string; tenant_id: string; project_id: string }, sentId: string) {
    const handler = getHandlers().client_sheet_images!;
    let state: unknown = null;
    for (;;) {
      const outcome = await handler.run({
        job: { ...job, kind: 'client_sheet_images', attempts: 1 },
        payload: handler.payload.parse({ sentPackageId: sentId }),
        state,
        progress: async () => {},
        timeLeft: () => Number.MAX_SAFE_INTEGER,
        sleep: async () => {},
        signal: new AbortController().signal,
      } as never);
      if ('done' in outcome) return outcome.done as ClientSheetImagesResult;
      state = outcome.continue;
    }
  }

  // The runner's finish: the job row done with its result.
  async function finish(jobId: string, result: ClientSheetImagesResult) {
    await harnessSql()`update public.job set status = 'done', progress = 100,
      result = ${harnessSql().json(result as never)} where id = ${jobId}::uuid`;
  }

  async function download(path: string) {
    const { data, error } = await adminDb().storage.from('exports').download(path);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  let ready: Sent;
  let readyDir = '';

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    tB = await createTenant();
    sA = await member(tA);
    sB = await member(tB);
    pA = await project(tA, sA, 'Hendricks kitchen');
    pB = await project(tB, sB, 'Other kitchen');
  }, 180000);

  afterAll(async () => {
    try {
      for (const t of [tA, tB]) {
        const prefix = `${t}/`;
        const rows = await harnessSql()<{ name: string }[]>`
          select name from storage.objects where bucket_id = 'exports' and name like ${prefix + '%'}`;
        if (rows.length > 0) await adminDb().storage.from('exports').remove(rows.map((r) => r.name));
      }
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('AC-EZD-2032-1 a send of a sheet set queues one client_sheet_images job, with no token in it; a Share does not', async () => {
    const sent = await send(sA, pA, true);
    const jobs = await jobsOf(sent.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ sentPackageId: sent.id });
    expect(JSON.stringify(jobs[0]!.payload)).not.toContain(sent.token);
    // Q-0059: up to 5 tries.
    expect(jobs[0]!.max_attempts).toBe(5);
    const share = await send(sA, pA, false);
    expect(await jobsOf(share.id)).toHaveLength(0);
  });

  it('AC-EZD-2032-1, AC-EZD-2032-2 the job writes one 2400 px image and one 400 px thumbnail per sheet of the frozen sent set, in set order', async () => {
    ready = await send(sA, pA, true);
    // Saved after the send: a second floor, which would add floor copies to a live set.
    const sql = harnessSql();
    const [seq] = await sql<{ n: number }[]>`
      select coalesce(max(updated_seq), 0) + 1 as n from public.model_object where project_id = ${pA}::uuid`;
    await sql`insert into public.model_object (tenant_id, project_id, object_id, type, schema_version, data, updated_seq)
      values (${tA}::uuid, ${pA}::uuid, ${randomUUID()}::uuid, 'floor', 1,
        ${sql.json({ name: 'Second floor', order: 2 })}, ${seq!.n})`;

    // Before the images exist the tab is preparing.
    const page = await loadClientPage(ready.token, { client: signedOut() });
    expect(page.status === 'active' && page.page.sharesSheets).toBe(true);
    expect(await loadClientSheets(ready.token, { client: signedOut() })).toEqual({
      status: 'active',
      plans: { state: 'preparing' },
    });

    const [job] = await jobsOf(ready.id);
    const result = await runJob(job!, ready.id);
    readyDir = `${tA}/${pA}/client-sheets/${ready.id}`;
    expect(result.dir).toBe(readyDir);
    expect(result.sheets.map((s) => s.number)).toEqual(DEFAULT_PERMIT_SHEETS);
    for (const s of result.sheets) {
      expect([s.width, s.height, s.thumbWidth, s.thumbHeight]).toEqual([2400, 1600, 400, 267]);
    }
    const full = await sharp(await download(`${readyDir}/02.webp`)).metadata();
    expect([full.format, full.width, full.height]).toEqual(['webp', 2400, 1600]);
    const thumb = await sharp(await download(`${readyDir}/02-thumb.webp`)).metadata();
    expect([thumb.format, thumb.width]).toEqual(['webp', 400]);
    await finish(job!.id, result);
  }, 120000);

  it('AC-EZD-2032-2, AC-EZD-2032-3 the Plans tab lists the sheets in set order with signed links of at most SIGNED_DOWNLOAD_SECONDS', async () => {
    const r = await loadClientSheets(ready.token, { client: signedOut() });
    expect(r.status).toBe('active');
    if (r.status !== 'active' || r.plans.state !== 'ready') throw new Error('not ready');
    expect(r.plans.sheets.map((s) => s.number)).toEqual(DEFAULT_PERMIT_SHEETS);
    const first = r.plans.sheets[0]!;
    for (const url of [first.src, first.thumb.src]) {
      const token = new URL(url).searchParams.get('token')!;
      const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
        iat: number;
        exp: number;
      };
      expect(claims.exp - claims.iat).toBeLessThanOrEqual(SIGNED_DOWNLOAD_SECONDS);
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/webp');
    }
  });

  it('is safe to run twice', async () => {
    const [job] = await jobsOf(ready.id);
    await expectSafeToRunTwice('client_sheet_images', {
      payload: { sentPackageId: ready.id },
      job: { id: job!.id, tenant_id: tA, project_id: pA, kind: 'client_sheet_images' },
    });
  }, 120000);

  it('AC-EZD-2032-1 a failed write is a retryable error, and the next try succeeds', async () => {
    const sent = await send(sA, pA, true);
    const [job] = await jobsOf(sent.id);
    failing.uploads = true;
    let caught: unknown = null;
    try {
      await runJob(job!, sent.id);
    } catch (e) {
      caught = e;
    } finally {
      failing.uploads = false;
    }
    expect(caught).toBeInstanceOf(JobError);
    expect((caught as JobError).code).toBe('storage_unavailable');
    expect((caught as JobError).retry).toBe(true);
    const result = await runJob(job!, sent.id);
    // This send froze the second floor saved earlier, so its set has the floor copies (A1.1 after A1.0, 09h).
    const numbers = result.sheets.map((s) => s.number);
    expect(numbers.slice(0, 3)).toEqual(['A0.0', 'A1.0', 'A1.1']);
    expect(numbers.length).toBeGreaterThan(DEFAULT_PERMIT_SHEETS.length);
    const meta = await sharp(await download(`${result.dir}/01.webp`)).metadata();
    expect(meta.width).toBe(2400);
  }, 120000);

  it('AC-EZD-2032-2 a Share from another tab, and a send with no images job (made before EZD-2032), have no Plans tab', async () => {
    const share = await send(sA, pA, false);
    const p1 = await loadClientPage(share.token, { client: signedOut() });
    expect(p1.status === 'active' && p1.page.sharesSheets).toBe(false);
    expect(await loadClientSheets(share.token, { client: signedOut() })).toEqual({
      status: 'active',
      plans: { state: 'none' },
    });
    // A set send whose job row does not exist, as for every send made before this ticket.
    const old = await send(sA, pA, true);
    await harnessSql()`delete from public.job where kind = 'client_sheet_images' and payload ->> 'sentPackageId' = ${old.id}`;
    const p2 = await loadClientPage(old.token, { client: signedOut() });
    expect(p2.status === 'active' && p2.page.sharesSheets).toBe(false);
    expect(await loadClientSheets(old.token, { client: signedOut() })).toEqual({
      status: 'active',
      plans: { state: 'none' },
    });
  });

  it('AC-EZD-2032-3, AC-EZD-2032-4 storage: only the server may sign, only a live link\'s images, never another company\'s path', async () => {
    const path = `${readyDir}/01.webp`;
    // The signed-out server (gate header) signs a live link's image.
    expect((await anonDb({ gate: true }).storage.from('exports').createSignedUrl(path, 60)).error).toBeNull();
    // Without the gate header (a browser with the public key) it cannot.
    expect((await anonDb({ gate: false }).storage.from('exports').createSignedUrl(path, 60)).error).not.toBeNull();
    // The package id under another company's tenant and project is refused.
    const crossed = `${tB}/${pB}/client-sheets/${ready.id}/01.webp`;
    await adminDb().storage.from('exports').upload(crossed, Buffer.from('x'), { upsert: true });
    expect((await anonDb({ gate: true }).storage.from('exports').createSignedUrl(crossed, 60)).error).not.toBeNull();
    // Company B's member cannot read or change company A's sheet images or package.
    expect((await sB.serverDb.storage.from('exports').createSignedUrl(path, 60)).error).not.toBeNull();
    const del = await sB.serverDb.storage.from('exports').remove([path]);
    expect(del.data ?? []).toEqual([]);
    const pkg = await sB.serverDb.from('sent_package').select('id').eq('id', ready.id);
    expect(pkg.data ?? []).toEqual([]);
    const jobs = await sB.serverDb.from('job').select('id').eq('kind', 'client_sheet_images').eq('project_id', pA);
    expect(jobs.data ?? []).toEqual([]);
    // Anon can neither write nor delete.
    const up = await anonDb({ gate: true })
      .storage.from('exports')
      .upload(`${readyDir}/99.webp`, Buffer.from('x'), { contentType: 'image/webp' });
    expect(up.error).not.toBeNull();
    const rm = await anonDb({ gate: true }).storage.from('exports').remove([path]);
    expect(rm.data ?? []).toEqual([]);
    expect((await download(path)).length).toBeGreaterThan(0);
  });

  it('AC-EZD-2032-3 an expired or revoked link gets no sheets and its images can no longer be signed', async () => {
    const path = `${readyDir}/01.webp`;
    const sql = harnessSql();
    await sql`update public.sent_package set revoked_at = now() where id = ${ready.id}::uuid`;
    expect((await loadClientSheets(ready.token, { client: signedOut() })).status).toBe('not_found');
    expect((await anonDb({ gate: true }).storage.from('exports').createSignedUrl(path, 60)).error).not.toBeNull();
    await sql`update public.sent_package set revoked_at = null, created_at = now() - interval '2 days',
      expires_at = now() - interval '1 day' where id = ${ready.id}::uuid`;
    const expired = await loadClientSheets(ready.token, { client: signedOut() });
    expect(expired.status).toBe('expired');
    expect(JSON.stringify(expired)).not.toContain('token=');
    expect((await anonDb({ gate: true }).storage.from('exports').createSignedUrl(path, 60)).error).not.toBeNull();
  });
});
