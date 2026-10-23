// EZD-018 T2-T9, T23 (vault/plans/EZD-018.md Tests): Realtime authorization on the local stack. Fresh
// tenants, projects and members per run from EZD-006's fixtures, removed in afterAll; tokens from signIn
// (no email sent). Broadcasts go through the admin SQL connection: private.broadcast_project / _user
// (Step 3). "Refused" = the pinned @supabase/realtime-js 2.118.0 reports CHANNEL_ERROR and never
// SUBSCRIBED (read from the pinned version: a private join without read permission reports CHANNEL_ERROR
// "Unauthorized: You do not have permissions to read from this Channel topic"). "Receives nothing" = zero
// matching events 3,000 ms after the send returns; SUBSCRIBED and presence within 10,000 ms (plan Tests
// intro). Payloads are compared after toEventPayload (Step 5).
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Member,
} from '../../../test-harness/rls/fixtures';
import {
  closeAllRealtime,
  connectRealtime,
  eventsNamed,
  JOIN_WAIT_MS,
  QUIET_MS,
  sleep,
  waitFor,
  wasRefused,
} from '../../../test-harness/realtime/node-client';

// Several joins, a refusal (the pinned stack reports it about 5 s after the join) and a quiet time per test.
const LONG = 45_000;

async function broadcastProject(projectId: string, event: string, payload: unknown): Promise<void> {
  const sql = harnessSql();
  await sql`select private.broadcast_project(${projectId}::uuid, ${event}, ${sql.json(payload as postgres.JSONValue)}::jsonb)`;
}

async function broadcastUser(appUserId: string, event: string, payload: unknown): Promise<void> {
  const sql = harnessSql();
  await sql`select private.broadcast_user(${appUserId}::uuid, ${event}, ${sql.json(payload as postgres.JSONValue)}::jsonb)`;
}

async function deactivate(m: Member): Promise<void> {
  await harnessSql()`update public.membership set status = 'deactivated' where id = ${m.membershipId}::uuid`;
}

async function sqlStateOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('EZD-018 realtime authorization', () => {
  let tenantA: string;
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    tenantA = await createTenant();
    [p1, p2] = await createProjects(tenantA, 2);
  });

  afterAll(async () => {
    await closeAllRealtime();
    await cleanup();
    await closeHarness();
  }, 60000);

  it(
    'EZD-018 done when: a scoped user cannot subscribe to a project outside their list @smoke',
    async () => {
      const s = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
      const { accessToken } = await signIn(s.email);
      const rt = await connectRealtime(accessToken);
      const c1 = rt.join(`project:${p1}`);
      const c2 = rt.join(`project:${p2}`);
      const [j1] = await Promise.all([c1.joined, c2.joined]);
      expect(j1).toBe('SUBSCRIBED');
      expect(wasRefused(c2)).toBe(true);

      await broadcastProject(p1, 'dev.ping', { n: 2 });
      await broadcastProject(p2, 'dev.ping', { n: 2 });
      await waitFor(() => eventsNamed(c1, 'dev.ping').length > 0, JOIN_WAIT_MS);
      await sleep(QUIET_MS);

      const got = eventsNamed(c1, 'dev.ping');
      expect(got).toHaveLength(1);
      expect(got[0].payload).toEqual({ n: 2 });
      expect(c2.events).toHaveLength(0);
      expect(c2.statuses).not.toContain('SUBSCRIBED');
    },
    LONG,
  );

  it(
    'EZD-018 T3 other tenant, no user token and ended session are refused; all-scope member joins',
    async () => {
      const tenantB = await createTenant();
      const x = await createMember({ tenantId: tenantB, scope: 'all' });
      const d = await createMember({ tenantId: tenantA, scope: 'all' });
      const u = await createMember({ tenantId: tenantA, scope: 'all' });
      const xToken = (await signIn(x.email)).accessToken;
      const dToken = (await signIn(d.email)).accessToken;
      const uToken = (await signIn(u.email)).accessToken;
      // (c): EZD-006 ends d's session when the membership is deactivated; d keeps the same token.
      await deactivate(d);
      expect(await sessionCount(d.authUserId)).toBe(0);

      const topic = `project:${p1}`;
      const ca = (await connectRealtime(xToken)).join(topic);
      const cb = (await connectRealtime(null)).join(topic, { private: true });
      const cc = (await connectRealtime(dToken)).join(topic);
      const cd = (await connectRealtime(uToken)).join(topic);
      const [, , , jd] = await Promise.all([ca.joined, cb.joined, cc.joined, cd.joined]);

      expect(wasRefused(ca)).toBe(true);
      expect(wasRefused(cb)).toBe(true);
      expect(wasRefused(cc)).toBe(true);
      expect(jd).toBe('SUBSCRIBED');

      await broadcastProject(p1, 'dev.ping', { n: 1 });
      await sleep(QUIET_MS);
      for (const ch of [ca, cb, cc]) {
        expect(ch.events).toHaveLength(0);
        expect(ch.statuses).not.toContain('SUBSCRIBED');
      }
    },
    LONG,
  );

  it(
    'EZD-018 T4 user channel: own channel receives, another user channel is refused',
    async () => {
      const m = await createMember({ tenantId: tenantA, scope: 'all' });
      const k = await createMember({ tenantId: tenantA, scope: 'all' });
      const rt = await connectRealtime((await signIn(m.email)).accessToken);
      const own = rt.join(`user:${m.appUserId}`);
      const other = rt.join(`user:${k.appUserId}`);
      const [jOwn] = await Promise.all([own.joined, other.joined]);
      expect(jOwn).toBe('SUBSCRIBED');
      expect(wasRefused(other)).toBe(true);

      await broadcastUser(m.appUserId, 'dev.ping', { n: 3 });
      await waitFor(() => own.events.length > 0, JOIN_WAIT_MS);
      await sleep(QUIET_MS);
      expect(own.events).toHaveLength(1);
      expect(own.events[0].payload).toEqual({ n: 3 });
      expect(other.events).toHaveLength(0);
    },
    LONG,
  );

  it(
    'EZD-018 T5 clients cannot broadcast; presence works; public channels stay apart',
    async () => {
      const a = await createMember({ tenantId: tenantA, scope: 'all' });
      const b = await createMember({ tenantId: tenantA, scope: 'all' });
      const topic = `project:${p1}`;
      const ca = (await connectRealtime((await signIn(a.email)).accessToken)).join(topic, {
        presenceKey: a.appUserId,
      });
      const cb = (await connectRealtime((await signIn(b.email)).accessToken)).join(topic, {
        presenceKey: b.appUserId,
      });
      const [ja, jb] = await Promise.all([ca.joined, cb.joined]);
      expect(ja).toBe('SUBSCRIBED');
      expect(jb).toBe('SUBSCRIBED');

      // (a) a client broadcast on the private channel.
      await ca.send('lock.changed', {});
      // (b) presence.
      await ca.track({ appUserId: a.appUserId });
      await cb.track({ appUserId: b.appUserId });
      // (c) a publishable-key client with no user token on the public channel of the same topic.
      const pub = (await connectRealtime(null)).join(topic, { private: false });
      expect(await pub.joined).toBe('SUBSCRIBED');
      await pub.send('dev.ping', { n: 9 });

      const both = [a.appUserId, b.appUserId].sort();
      const sawBoth = await waitFor(
        () =>
          JSON.stringify(ca.presenceIds()) === JSON.stringify(both) &&
          JSON.stringify(cb.presenceIds()) === JSON.stringify(both),
        JOIN_WAIT_MS,
      );
      await sleep(QUIET_MS);

      expect(sawBoth).toBe(true);
      expect(ca.presenceIds()).toEqual(both);
      expect(cb.presenceIds()).toEqual(both);
      expect(cb.events).toHaveLength(0);
      expect(ca.events).toHaveLength(0);
    },
    LONG,
  );

  it(
    'EZD-018 T6 malformed, unknown and non-canonical topics are refused',
    async () => {
      const u = await createMember({ tenantId: tenantA, scope: 'all' });
      const token = (await signIn(u.email)).accessToken;
      const topics = [
        'project:not-a-uuid',
        `project:${randomUUID()}`,
        `project:${p1.toUpperCase()}`,
        `tenant:${tenantA}`,
        'user:',
        `project:${p1}:x`,
      ];
      for (const topic of topics) {
        const rt = await connectRealtime(token);
        const c = rt.join(topic);
        await c.joined;
        expect(wasRefused(c), c.topic).toBe(true);
      }
    },
    LONG,
  );

  it('EZD-018 T7 function privileges', async () => {
    const sql = harnessSql();
    const can = async (role: string, fn: string) => {
      const rows = await sql`select has_function_privilege(${role}, ${fn}, 'execute') as ok`;
      return rows[0].ok as boolean;
    };
    for (const fn of [
      'private.realtime_topic_id(text, text)',
      'private.realtime_can_receive(text)',
      'private.realtime_can_track(text)',
    ]) {
      expect(await can('authenticated', fn), fn).toBe(true);
      expect(await can('anon', fn), fn).toBe(false);
    }
    for (const fn of [
      'private.broadcast_project(uuid, text, jsonb)',
      'private.broadcast_user(uuid, text, jsonb)',
      'private.end_user_sessions(uuid)',
    ]) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        expect(await can(role, fn), `${role} ${fn}`).toBe(false);
      }
    }
  });

  it('EZD-018 T8 policies on realtime.messages', async () => {
    const rows = await harnessSql()`
      select policyname, cmd, roles::text[] as roles, qual, with_check
      from pg_policies where schemaname = 'realtime' and tablename = 'messages'
      order by policyname`;
    expect(rows.map((r) => r.policyname)).toEqual([
      'realtime_messages_insert',
      'realtime_messages_select',
    ]);
    const ins = rows.find((r) => r.policyname === 'realtime_messages_insert')!;
    const sel = rows.find((r) => r.policyname === 'realtime_messages_select')!;
    expect(sel.cmd).toBe('SELECT');
    expect(ins.cmd).toBe('INSERT');
    expect(sel.roles).toEqual(['authenticated']);
    expect(ins.roles).toEqual(['authenticated']);
    const q = String(sel.qual);
    expect(q).toContain('( SELECT private.realtime_can_receive');
    expect(q).toContain('broadcast');
    expect(q).toContain('presence');
    const w = String(ins.with_check);
    expect(w).toContain('( SELECT private.realtime_can_track');
    expect(w).toContain('presence');
    expect(w).not.toContain('broadcast');
  });

  it('EZD-018 T9 broadcast argument checks raise 22023', async () => {
    const sql = harnessSql();
    for (const e of ['Bad Name', 'lock', 'lock.*', '']) {
      const code = await sqlStateOf(
        () => sql`select private.broadcast_project(${p1}::uuid, ${e}, '{}'::jsonb)`,
      );
      expect(code, JSON.stringify(e)).toBe('22023');
    }
    expect(
      await sqlStateOf(
        () => sql`select private.broadcast_project(${p1}::uuid, null::text, '{}'::jsonb)`,
      ),
    ).toBe('22023');
    expect(
      await sqlStateOf(
        () => sql`select private.broadcast_user(null::uuid, 'dev.ping', '{}'::jsonb)`,
      ),
    ).toBe('22023');
  });

  it(
    'EZD-018 T23 deactivation pushes session.ended on the user channel',
    async () => {
      const d = await createMember({ tenantId: tenantA, scope: 'all' });
      const rt = await connectRealtime((await signIn(d.email)).accessToken);
      const proj = rt.join(`project:${p1}`);
      const own = rt.join(`user:${d.appUserId}`);
      const [jp, ju] = await Promise.all([proj.joined, own.joined]);
      expect(jp).toBe('SUBSCRIBED');
      expect(ju).toBe('SUBSCRIBED');

      await deactivate(d);
      const arrived = await waitFor(
        () => eventsNamed(own, 'session.ended').length > 0,
        JOIN_WAIT_MS,
      );
      await sleep(QUIET_MS);

      expect(arrived).toBe(true);
      const ended = eventsNamed(own, 'session.ended');
      expect(ended).toHaveLength(1);
      expect(ended[0].payload).toEqual({});
      expect(await sessionCount(d.authUserId)).toBe(0);
    },
    LONG,
  );
});
