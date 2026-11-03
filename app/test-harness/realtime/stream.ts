// EZD-291 (vault/plans/EZD-291.md sections 1 and 3): keeps a live-Realtime test from depending on fixed waits.
// Local Realtime stops its broadcast stream about 10 minutes after it starts and restarts it only at the next
// channel join, while joined channels stay SUBSCRIBED (R-048). A probe broadcast proves the stream live before
// a step (a join restarts it when the probe is lost); a second probe after the step is the fence (delivery is
// in commit order); a step repeats once only when the stream provably broke inside it. Test-only; never
// imported by app code.
import { randomUUID } from 'node:crypto';
import type { Sql } from '../rls/db';
import {
  connectRealtime,
  JOIN_WAIT_MS,
  sleep,
  waitFor,
  type ReceivedEvent,
  type TestChannel,
} from './node-client';

export const PROBE_EVENT = 'test.probe';
export const STREAM_PID_SQL = `select active_pid from pg_catalog.pg_replication_slots where starts_with(slot_name, 'supabase_realtime_messages_replication_slot') and active`;

export type StepState = {
  fenceSeen: boolean;
  pidBefore: number | null;
  pidAfter: number | null;
  statusesBefore: number;
  statusesAfter: number;
};

export type StreamContext = {
  sql: Sql;
  channel: TestChannel;
  appUserId: string;
  accessToken: string;
};
export type FencedStepResult = { arrived: ReceivedEvent[]; attempts: number };

export async function streamPid(sql: Sql): Promise<number | null> {
  const rows = await sql.unsafe(STREAM_PID_SQL);
  if (rows.length === 0) return null;
  const pid = (rows[0] as unknown as { active_pid: unknown }).active_pid;
  return pid === null || pid === undefined ? null : Number(pid);
}

export async function waitForStream(sql: Sql): Promise<number | null> {
  const end = Date.now() + JOIN_WAIT_MS;
  let pid = await streamPid(sql);
  while (pid === null && Date.now() < end) {
    await sleep(250);
    pid = await streamPid(sql);
  }
  return pid;
}

export async function sendProbe(sql: Sql, appUserId: string): Promise<string> {
  const nonce = randomUUID();
  await sql`select private.broadcast_user(${appUserId}::uuid, 'test.probe', jsonb_build_object('probe', ${nonce}::text))`;
  return nonce;
}

export function probeIndex(events: ReceivedEvent[], nonce: string): number {
  return events.findIndex(
    (e) =>
      e.event === PROBE_EVENT &&
      typeof e.payload === 'object' &&
      e.payload !== null &&
      (e.payload as { probe?: unknown }).probe === nonce,
  );
}

export function eventsBetween(
  events: ReceivedEvent[],
  startNonce: string,
  endNonce: string,
  name: string,
): ReceivedEvent[] | null {
  const s = probeIndex(events, startNonce);
  const e = probeIndex(events, endNonce);
  if (s < 0 || e < 0 || e < s) return null;
  return events.slice(s + 1, e).filter((x) => x.event === name);
}

export function stepOutcome(s: StepState): 'complete' | 'interrupted' {
  return s.fenceSeen &&
    s.pidBefore !== null &&
    s.pidBefore === s.pidAfter &&
    s.statusesAfter === s.statusesBefore
    ? 'complete'
    : 'interrupted';
}

export async function ensureStream(
  ctx: StreamContext,
): Promise<{ nonce: string; pid: number | null }> {
  const { sql, channel, appUserId, accessToken } = ctx;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const nonce = await sendProbe(sql, appUserId);
    if (await waitFor(() => probeIndex(channel.events, nonce) >= 0, JOIN_WAIT_MS)) {
      return { nonce, pid: await streamPid(sql) };
    }
    if (attempt === 1) {
      const k = await connectRealtime(accessToken);
      await k.join(channel.topic).joined;
      await waitForStream(sql);
    }
  }
  throw new Error('realtime_stream_unavailable');
}

export async function fencedStep(
  opts: StreamContext & {
    event: string;
    restore?: () => Promise<unknown>;
    run: () => Promise<unknown>;
  },
): Promise<FencedStepResult> {
  const { sql, channel, appUserId, event, restore, run } = opts;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await restore?.();
    const start = await ensureStream(opts);
    const statusesBefore = channel.statuses.length;
    await run();
    const end = await sendProbe(sql, appUserId);
    const fenceSeen = await waitFor(() => probeIndex(channel.events, end) >= 0, JOIN_WAIT_MS);
    const pidAfter = await streamPid(sql);
    const outcome = stepOutcome({
      fenceSeen,
      pidBefore: start.pid,
      pidAfter,
      statusesBefore,
      statusesAfter: channel.statuses.length,
    });
    if (outcome === 'complete') {
      return {
        arrived: eventsBetween(channel.events, start.nonce, end, event) ?? [],
        attempts: attempt,
      };
    }
  }
  throw new Error('realtime_stream_interrupted');
}
