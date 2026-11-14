// EZD-109 U1-U8 (vault/plans/EZD-109.md section 4). Expected values: Q-0695 decisions 03 row 33 (the IP is the
// first x-forwarded-for value as a full address or null; a failed default-sink write is reported and never
// undoes the action); Q-0735 (a) (model.saved writes no row); the plan's Decided rows "eventLogIp", "Sink
// steps", "Report call" and "Sink object for each event". No database: the client is an in-memory fake.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTS, type EventName } from '../../lib/events/registry';
import type { EmittedEvent } from './emit';

const headersMock = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock('next/headers', () => headersMock);

const T = '11111111-1111-4111-8111-111111111111';
const U = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const P = '44444444-4444-4444-8444-444444444444';
const M = '55555555-5555-4555-8555-555555555555';

function event<N extends EventName>(
  name: N,
  payload: EmittedEvent<N>['payload'],
  projectId: string | null = null,
): EmittedEvent<EventName> {
  return {
    id: 'e1',
    name,
    at: '2026-11-11T12:00:00.000Z',
    tenantId: T,
    projectId,
    actorId: U,
    payload,
  } as EmittedEvent<EventName>;
}

type Call = [string, Record<string, unknown>];

function fakes(rpcResult: () => Promise<unknown>) {
  const calls: Call[] = [];
  const fake = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      return rpcResult();
    }),
  };
  const client = vi.fn(() => fake as never);
  const report = vi.fn(async () => ({ sentryEventId: null, alert: 'not_alerted' as const, alertId: null }));
  return { calls, fake, client, report };
}

describe('EZD-109 event log sink', () => {
  beforeEach(() => {
    headersMock.headers.mockReset();
  });

  it('U1 eventLogIp takes the first address or null', async () => {
    const { eventLogIp } = await import('./event-log');
    const ip = (v?: string) =>
      eventLogIp(new Headers(v === undefined ? {} : { 'x-forwarded-for': v }));
    const v45 = '0000:0000:0000:0000:0000:0000:255.255.255.255';
    expect(v45).toHaveLength(45);
    expect(ip('203.0.113.9, 10.0.0.1')).toBe('203.0.113.9');
    expect(ip(' 2001:db8::1 ')).toBe('2001:db8::1');
    expect(ip('::ffff:192.0.2.1')).toBe('::ffff:192.0.2.1');
    expect(ip('1.2.3.4')).toBe('1.2.3.4');
    expect(ip(v45)).toBe(v45);
    const v46 = '00000:0000:0000:0000:0000:0000:255.255.255.255';
    expect(v46).toHaveLength(46);
    for (const v of [
      undefined,
      '',
      ',203.0.113.9',
      'not-an-ip',
      '203.0.113.9:443',
      '[2001:db8::1]',
      'fe80::1%eth0',
      '999.1.1.1',
      v46,
    ]) {
      expect(ip(v), String(v)).toBeNull();
    }
  });

  it('U2 requestIp reads the request headers and never throws', async () => {
    const { requestIp } = await import('./event-log');
    headersMock.headers.mockResolvedValueOnce(
      new Headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }),
    );
    expect(await requestIp()).toBe('198.51.100.4');
    headersMock.headers.mockRejectedValueOnce(new Error('outside a request'));
    expect(await requestIp()).toBeNull();
  });

  it('U3 a sink event writes one log_event call', async () => {
    const { createEventLogSink } = await import('./event-log');
    const f = fakes(async () => ({ error: null }));
    const sink = createEventLogSink({
      client: f.client,
      requestIp: async () => '198.51.100.4',
      report: f.report,
    });
    expect(await sink(event('customer.created', { customerId: C }))).toBeUndefined();
    expect(f.calls).toEqual([
      [
        'log_event',
        {
          p_tenant_id: T,
          p_action: 'customer.created',
          p_object_type: 'customer',
          p_object_id: C,
          p_details: { customerId: C },
          p_ip: '198.51.100.4',
        },
      ],
    ]);
    expect(f.report).not.toHaveBeenCalled();
  });

  it('U4 rule none and transaction write nothing', async () => {
    const { createEventLogSink, EVENT_LOG } = await import('./event-log');
    const f = fakes(async () => ({ error: null }));
    const deps = { client: f.client, requestIp: async () => '198.51.100.4', report: f.report };
    await createEventLogSink(deps)(event('model.saved', { objectIds: [] }));
    await createEventLogSink(deps)(
      event('user.joined', { membershipId: M, appUserId: U, via: 'sign_in' }),
    );
    for (const name of [
      'user_permission.updated',
      'user.deactivated',
      'user.reactivated',
      'user.removed',
    ] as const) {
      await createEventLogSink(deps)(event(name, { membershipId: M, appUserId: U } as never));
    }
    await createEventLogSink({
      ...deps,
      rules: { ...EVENT_LOG, 'customer.created': { mode: 'transaction' } },
    })(event('customer.created', { customerId: C }));
    expect(f.client).toHaveBeenCalledTimes(0);
    expect(f.fake.rpc).toHaveBeenCalledTimes(0);
    expect(f.report).toHaveBeenCalledTimes(0);
  });

  it('U5 a failed write is reported, never thrown', async () => {
    const { createEventLogSink } = await import('./event-log');
    const cases: { rpc?: () => Promise<unknown>; clientThrows?: boolean; cause: string }[] = [
      { rpc: async () => ({ error: { code: '42501', message: 'x' } }), cause: '42501' },
      { clientThrows: true, cause: 'thrown' },
      { rpc: async () => Promise.reject(new Error('socket')), cause: 'thrown' },
      { rpc: async () => ({ error: { code: '', message: 'fetch failed' } }), cause: 'unknown' },
    ];
    for (const c of cases) {
      const f = fakes(c.rpc ?? (async () => ({ error: null })));
      const client = c.clientThrows
        ? vi.fn(() => {
            throw new Error('env');
          })
        : f.client;
      const sink = createEventLogSink({
        client: client as never,
        requestIp: async () => null,
        report: f.report,
      });
      await expect(sink(event('customer.created', { customerId: C }))).resolves.toBeUndefined();
      expect(f.report, c.cause).toHaveBeenCalledTimes(1);
      const [err, ctx] = f.report.mock.calls[0] as unknown as [Error, unknown];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('event_log_write_failed');
      expect(ctx).toEqual({
        source: 'function',
        location: 'events.event_log',
        tags: { 'ezd.event': 'customer.created', 'ezd.cause': c.cause },
      });
    }
  });

  it('U6 an object id that is not a uuid is reported and not sent', async () => {
    const { createEventLogSink } = await import('./event-log');
    const f = fakes(async () => ({ error: null }));
    const sink = createEventLogSink({ client: f.client, requestIp: async () => null, report: f.report });
    await sink(event('customer.created', { customerId: 'not-a-uuid' }));
    expect(f.fake.rpc).toHaveBeenCalledTimes(0);
    expect(f.report).toHaveBeenCalledTimes(1);
    const [err, ctx] = f.report.mock.calls[0] as unknown as [Error, unknown];
    expect(err.message).toBe('event_log_object_invalid');
    expect(ctx).toEqual({
      source: 'function',
      location: 'events.event_log',
      tags: { 'ezd.event': 'customer.created', 'ezd.cause': 'object_id' },
    });
  });

  it('U7 EVENT_LOG covers every event name @smoke', async () => {
    const { EVENT_LOG, EVENT_ACTION_MAX, EVENT_ACTION_PATTERN, projectOrTenant } = await import(
      './event-log'
    );
    expect(Object.keys(EVENT_LOG)).toEqual(Object.keys(EVENTS));
    expect(EVENT_ACTION_MAX).toBe(64);
    for (const name of Object.keys(EVENT_LOG)) {
      expect(name).toMatch(EVENT_ACTION_PATTERN);
      expect(name.length).toBeLessThanOrEqual(EVENT_ACTION_MAX);
    }
    expect(EVENT_LOG['model.saved'].mode).toBe('none');
    // Q-0695: permission, role and membership changes write in their own transaction.
    for (const name of [
      'user.joined',
      'user_permission.updated',
      'user.deactivated',
      'user.reactivated',
      'user.removed',
      'role.created',
      'role.updated',
      'role.deleted',
    ] as const) {
      expect(EVENT_LOG[name].mode, name).toBe('transaction');
    }
    const objectOf = (e: EmittedEvent<EventName>) => {
      const rule = EVENT_LOG[e.name] as { mode: string; object?: (x: typeof e) => unknown };
      expect(rule.mode, e.name).toBe('sink');
      return rule.object?.(e);
    };
    expect(objectOf(event('tenant.updated', { fields: ['name'] }))).toEqual({ type: 'tenant', id: T });
    expect(objectOf(event('customer.created', { customerId: C }))).toEqual({ type: 'customer', id: C });
    expect(objectOf(event('customer.updated', { customerId: C, fields: [] }))).toEqual({
      type: 'customer',
      id: C,
    });
    expect(objectOf(event('project.created', { projectId: P, source: 'standalone' }))).toEqual({
      type: 'project',
      id: P,
    });
    expect(objectOf(event('room.closure_overridden', { roomId: C, gapIn: 1, userId: U }))).toEqual({
      type: 'model_object',
      id: C,
    });
    expect(objectOf(event('user.language_changed', { appUserId: U, language: 'es' }))).toEqual({
      type: 'app_user',
      id: U,
    });
    expect(projectOrTenant(event('lock.acquired', {}, P))).toEqual({ type: 'project', id: P });
    expect(projectOrTenant(event('lock.acquired', {}, null))).toEqual({ type: 'tenant', id: T });
    expect(objectOf(event('lock.acquired', {}, P))).toEqual({ type: 'project', id: P });
  });

  it('U8 the event log sink is a default sink once', async () => {
    const { defaultSinks, eventLogSink } = await import('./index');
    expect(defaultSinks).toContain(eventLogSink);
    expect(defaultSinks.filter((s) => s === eventLogSink)).toHaveLength(1);
  });
});
