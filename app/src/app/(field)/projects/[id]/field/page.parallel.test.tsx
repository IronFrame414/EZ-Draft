// Performance audit 2026-11-26 (S17 Field pack (phone)): after the permission check the field pack page starts its
// three server reads (project, the user's language, the outbox actor) together. Each read is held open here; all
// three must have started before any of them answers. The rules of EZD-1404 stay: no View projects or a missing
// project is Not found, and Not found still wins when a later read failed too.
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
vi.mock('../../../../../field-pack/FieldPackScreen', () => ({ FieldPackScreen: () => null }));
vi.mock('../../../../../components/outbox/OutboxDrain', () => ({ OutboxDrain: () => null }));

import { FieldPackScreen } from '../../../../../field-pack/FieldPackScreen';
import { OutboxDrain } from '../../../../../components/outbox/OutboxDrain';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { loadOutboxActor } from '../../../../../server/outbox/actor';
import { can, getPermissionContext } from '../../../../../server/permissions';
import Page from './page';

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

type Row = { data: Record<string, unknown> | null; error: Error | null };

/** A session client whose `from(table)…maybeSingle()` answers with the held promise of that table. */
function fakeClient(reads: Record<string, Promise<Row>>) {
  const started: string[] = [];
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => {
          started.push(table);
          return reads[table]!;
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
const allow = () => {
  vi.mocked(getPermissionContext).mockResolvedValue({} as never);
  vi.mocked(can).mockReturnValue(true);
};

afterEach(() => {
  vi.mocked(getPermissionContext).mockReset();
  vi.mocked(can).mockReset();
  vi.mocked(loadOutboxActor).mockReset();
  vi.mocked(createSessionClient).mockReset();
});

describe('EZD-1404 field pack page server reads run together', () => {
  it('no read starts before the permission check passes', async () => {
    vi.mocked(getPermissionContext).mockResolvedValue({} as never);
    vi.mocked(can).mockReturnValue(false);
    const started = fakeClient({});
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(NOT_FOUND);
    expect(started).toEqual([]);
    expect(loadOutboxActor).not.toHaveBeenCalled();
  });

  it('all three reads have started before any of them answers', async () => {
    allow();
    const project = held<Row>();
    const user = held<Row>();
    const actor = held<typeof ACTOR>();
    const started = fakeClient({ project: project.promise, app_user: user.promise });
    vi.mocked(loadOutboxActor).mockReturnValue(actor.promise);

    let done = false;
    const page = Page({ params: Promise.resolve({ id: ID }) }).then((el) => {
      done = true;
      return el;
    });
    await tick();
    expect(started.sort()).toEqual(['app_user', 'project']);
    expect(loadOutboxActor).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // Answer in the reverse of the old order: the page still waits for all three.
    actor.resolve(ACTOR);
    user.resolve({ data: { language: 'es' }, error: null });
    await tick();
    expect(done).toBe(false);
    project.resolve({ data: { id: ID }, error: null });

    const tree = await page;
    expect(propsOf(tree, FieldPackScreen)).toMatchObject({ projectId: ID, language: 'es', canPhoto: true });
    expect(propsOf(tree, OutboxDrain)?.actor).toEqual(ACTOR);
  });

  it('a missing project is Not found even when the actor read failed; a project read error is thrown', async () => {
    allow();
    fakeClient({
      project: Promise.resolve({ data: null, error: null }),
      app_user: Promise.resolve({ data: null, error: null }),
    });
    vi.mocked(loadOutboxActor).mockRejectedValue(new Error('db down'));
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(NOT_FOUND);

    const failed = new Error('project read failed');
    fakeClient({
      project: Promise.resolve({ data: null, error: failed }),
      app_user: Promise.resolve({ data: null, error: null }),
    });
    vi.mocked(loadOutboxActor).mockResolvedValue(ACTOR);
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(failed);
  });

  it('a failed actor read is thrown when the project is there, as before', async () => {
    allow();
    fakeClient({
      project: Promise.resolve({ data: { id: ID }, error: null }),
      app_user: Promise.resolve({ data: { language: 'en' }, error: null }),
    });
    const boom = new Error('db down');
    vi.mocked(loadOutboxActor).mockRejectedValue(boom);
    await expect(Page({ params: Promise.resolve({ id: ID }) })).rejects.toBe(boom);
  });
});
