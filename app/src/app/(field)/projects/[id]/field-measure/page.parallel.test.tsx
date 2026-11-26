// EZD-1994 (performance audit 2026-11-26, Q-0814; S17b Field measure): after the permission check the field measure
// page starts its four server reads (the rooms, the user's language, the company defaults, the outbox actor) together.
// Each read is held open here; all four must have started before any of them answers. The rules of EZD-1415 stay: no
// View projects or a missing project is Not found, and Not found still wins when a later read failed too. The tolerance
// is the company Measurement tolerance (EZD-1416; 0.25 here is a stored value, passed through as it is).
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ID = '11111111-1111-4111-8111-111111111111';
const NOT_FOUND = new Error('NEXT_NOT_FOUND');

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock('../../../../../server/auth/session', () => ({
  requireSession: async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'crew@example.com' }),
}));
vi.mock('../../../../../server/permissions', () => ({ can: vi.fn(), getPermissionContext: vi.fn() }));
vi.mock('../../../../../server/auth/supabase-server', () => ({ createSessionClient: vi.fn() }));
vi.mock('../../../../../server/outbox/actor', () => ({ loadOutboxActor: vi.fn() }));
vi.mock('../../../../../server/field-measure/session', () => ({ readFieldMeasure: vi.fn() }));
vi.mock('../../../../../server/defaults/defaults', () => ({ loadTenantDefaults: vi.fn() }));
vi.mock('../../../../../lib/defaults/values', () => ({
  effectiveValue: (_key: string, stored: Record<string, unknown>) => stored.measurement_tolerance,
}));
vi.mock('../../../../../lib/imports/review-conflicts', () => ({ reviewTolerance: (v: unknown) => v }));
vi.mock('../../../../../field-measure/FieldMeasureScreen', () => ({ FieldMeasureScreen: () => null }));
vi.mock('../../../../../components/outbox/OutboxDrain', () => ({ OutboxDrain: () => null }));
vi.mock('../../../../../components/phone/PhoneFrame', () => ({ PhoneFrame: () => null }));
vi.mock('../../../../../components/disclaimer/Disclaimer', () => ({ Disclaimer: () => null }));

import { FieldMeasureScreen } from '../../../../../field-measure/FieldMeasureScreen';
import { OutboxDrain } from '../../../../../components/outbox/OutboxDrain';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { loadTenantDefaults } from '../../../../../server/defaults/defaults';
import { readFieldMeasure } from '../../../../../server/field-measure/session';
import { loadOutboxActor } from '../../../../../server/outbox/actor';
import { can, getPermissionContext } from '../../../../../server/permissions';
import Page from './page';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

type Row = { data: Record<string, unknown> | null; error: Error | null };

/** A session client whose `from('app_user')…maybeSingle()` answers with the given promise. */
function fakeClient(user: Promise<Row>) {
  const started: string[] = [];
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => {
          started.push(table);
          return user;
        },
      };
      return chain;
    },
  };
  vi.mocked(createSessionClient).mockReturnValue(client as never);
  return started;
}

/** The props of the first element of the given component type in a server-rendered tree. */
function propsOf(node: unknown, type: unknown): Record<string, unknown> | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf(child, type);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el.props;
  return propsOf(el.props?.children, type);
}

const ACTOR = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const VIEW = { projectName: 'Maple St kitchen', rooms: [], sentAt: null };
const allow = () => {
  vi.mocked(getPermissionContext).mockResolvedValue({} as never);
  vi.mocked(can).mockReturnValue(true);
};

afterEach(() => {
  vi.mocked(getPermissionContext).mockReset();
  vi.mocked(can).mockReset();
  vi.mocked(loadOutboxActor).mockReset();
  vi.mocked(readFieldMeasure).mockReset();
  vi.mocked(loadTenantDefaults).mockReset();
  vi.mocked(createSessionClient).mockReset();
});

describe('EZD-1994 AC-EZD-1994-2 field measure page server reads run together', () => {
  it('no read starts before the permission check passes', async () => {
    vi.mocked(getPermissionContext).mockResolvedValue(null);
    const started = fakeClient(Promise.resolve({ data: null, error: null }));
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(NOT_FOUND);
    expect(started).toEqual([]);
    expect(readFieldMeasure).not.toHaveBeenCalled();
    expect(loadTenantDefaults).not.toHaveBeenCalled();
    expect(loadOutboxActor).not.toHaveBeenCalled();
  });

  it('AC-EZD-1994-3 all four reads have started before any of them answers', async () => {
    allow();
    const view = held<typeof VIEW>();
    const user = held<Row>();
    const defaults = held<Record<string, unknown>>();
    const actor = held<typeof ACTOR>();
    const started = fakeClient(user.promise);
    vi.mocked(readFieldMeasure).mockReturnValue(view.promise as never);
    vi.mocked(loadTenantDefaults).mockReturnValue(defaults.promise as never);
    vi.mocked(loadOutboxActor).mockReturnValue(actor.promise);

    let done = false;
    const page = Page({ params: Promise.resolve({ id: ID }) }).then((el) => {
      done = true;
      return el;
    });
    await tick();
    expect(started).toEqual(['app_user']);
    expect(readFieldMeasure).toHaveBeenCalledTimes(1);
    expect(loadTenantDefaults).toHaveBeenCalledTimes(1);
    expect(loadOutboxActor).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // Answer in the reverse of the old order: the page still waits for all four.
    actor.resolve(ACTOR);
    defaults.resolve({ measurement_tolerance: 0.25 });
    user.resolve({ data: { language: 'es' }, error: null });
    await tick();
    expect(done).toBe(false);
    view.resolve(VIEW);

    const tree = await page;
    expect(propsOf(tree, FieldMeasureScreen)).toMatchObject({
      projectId: ID,
      projectName: 'Maple St kitchen',
      initialRooms: [],
      tolerance: 0.25,
      sentAt: null,
      canEdit: true,
      canReopen: true,
    });
    expect(propsOf(tree, OutboxDrain)?.actor).toEqual(ACTOR);
  });

  it('a missing project is Not found even when a later read failed; a failed later read is thrown otherwise', async () => {
    allow();
    const boom = new Error('db down');
    fakeClient(Promise.resolve({ data: null, error: null }));
    vi.mocked(readFieldMeasure).mockResolvedValue(null);
    vi.mocked(loadTenantDefaults).mockRejectedValue(boom);
    vi.mocked(loadOutboxActor).mockResolvedValue(ACTOR);
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(NOT_FOUND);

    vi.mocked(readFieldMeasure).mockResolvedValue(VIEW as never);
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(boom);
  });
});
