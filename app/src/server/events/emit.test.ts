import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EventName, EventPayloads } from '../../lib/events/registry';
import { createEmitter, UnknownEventError, type EventSink } from './emit';

const ctx = { tenantId: 't1' };

describe('EZD-022 emit', () => {
  it('T4 emit delivers a registered event', async () => {
    const calls: string[] = [];
    const seen: unknown[] = [];
    const a: EventSink = (e) => {
      calls.push('a');
      seen.push(e);
    };
    const b: EventSink = (e) => {
      calls.push('b');
      seen.push(e);
    };
    const { emit } = createEmitter({
      sinks: [a, b],
      now: () => new Date('2026-10-11T12:00:00.000Z'),
      newId: () => 'evt-1',
    });
    const expected = {
      id: 'evt-1',
      name: 'lock.acquired',
      at: '2026-10-11T12:00:00.000Z',
      tenantId: 't1',
      projectId: 'p1',
      actorId: 'u1',
      payload: { by: 'u1' },
    };
    const got = await emit(
      'lock.acquired',
      { by: 'u1' },
      { tenantId: 't1', projectId: 'p1', actorId: 'u1' },
    );
    expect(got).toEqual(expected);
    expect(calls).toEqual(['a', 'b']);
    expect(seen[0]).toEqual(expected);
    expect(seen[1]).toEqual(expected);
    const short = await emit('lock.acquired', { by: 'u1' }, ctx);
    expect(short.projectId).toBeNull();
    expect(short.actorId).toBeNull();

    const real = createEmitter({ sinks: [] });
    const e1 = await real.emit('model.saved', {}, ctx);
    const e2 = await real.emit('model.saved', {}, ctx);
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(e1.id).toMatch(v4);
    expect(e2.id).toMatch(v4);
    expect(e1.id).not.toBe(e2.id);
  });

  it('T5 unknown name refused at runtime', async () => {
    let called = 0;
    const { emit } = createEmitter({ sinks: [() => void called++] });
    for (const x of ['not.registered', 'toString', 'lock.*']) {
      const err = await emit(x as EventName, {}, ctx).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, x).toBeInstanceOf(UnknownEventError);
      expect((err as Error).message).toContain(x);
    }
    expect(called).toBe(0);
  });

  it('T6 unknown name refused at typecheck', async () => {
    const { emit } = createEmitter({ sinks: [] });
    await expect(
      // @ts-expect-error not.registered is not an EventName, which is what this test proves
      emit('not.registered', {}, ctx),
    ).rejects.toBeInstanceOf(UnknownEventError);
    expectTypeOf<keyof EventPayloads>().toEqualTypeOf<EventName>();
  });

  it('T9 sink failure does not skip later sinks', async () => {
    const boom = new Error('boom');
    let bCalls = 0;
    const { emit } = createEmitter({
      sinks: [
        () => {
          throw boom;
        },
        () => void bCalls++,
      ],
    });
    const err = await emit('model.saved', {}, ctx).then(
      () => null,
      (e: unknown) => e,
    );
    expect(bCalls).toBe(1);
    expect(err).toBeInstanceOf(AggregateError);
    const agg = err as AggregateError;
    expect(agg.errors).toHaveLength(1);
    expect(agg.errors[0]).toBe(boom);
  });
});
