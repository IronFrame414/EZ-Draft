// Performance audit 2026-11-26 (11 Budgets "Open a project"): the editor page starts its three server reads (rail
// order, mesh link, permissions) together, so the page waits for the slowest read and not for their sum. Each read
// is held open here; all three must have started before any of them answers. A failed read is still reported and
// leaves its default, as before (EZD-230, EZD-503, EZD-111).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: vi.fn(async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'm@example.com' })),
}));
vi.mock('../../../../editor/ProjectEditor', () => ({ ProjectEditor: vi.fn(() => null) }));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: vi.fn(() => ({})) }));
vi.mock('../../../../server/profile/rail-order', () => ({ loadRailOrder: vi.fn() }));
vi.mock('../../../../server/settings/shell-data', () => ({ settingsPermissionContext: vi.fn() }));
vi.mock('../../../../server/imports/project-mesh', () => ({ projectMeshUrl: vi.fn() }));
vi.mock('../../../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));

import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { reportError } from '../../../../server/errors/report';
import { projectMeshUrl } from '../../../../server/imports/project-mesh';
import { loadRailOrder } from '../../../../server/profile/rail-order';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import EditorPage from './page';

const ID = '11111111-1111-4111-8111-111111111111';

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

afterEach(() => {
  vi.mocked(reportError).mockClear();
  vi.mocked(ProjectEditor).mockClear();
  vi.mocked(loadRailOrder).mockReset();
  vi.mocked(projectMeshUrl).mockReset();
  vi.mocked(settingsPermissionContext).mockReset();
});

describe('EZD-503 editor page server reads run together', () => {
  it('all three reads have started before any of them answers', async () => {
    const rail = held<string[]>();
    const mesh = held<string | null>();
    const ctx = held<null>();
    vi.mocked(loadRailOrder).mockReturnValue(rail.promise);
    vi.mocked(projectMeshUrl).mockReturnValue(mesh.promise);
    vi.mocked(settingsPermissionContext).mockReturnValue(ctx.promise);

    let done = false;
    const page = EditorPage({ params: Promise.resolve({ id: ID }) }).then((el) => {
      done = true;
      return el;
    });
    await tick();
    expect(loadRailOrder).toHaveBeenCalledTimes(1);
    expect(projectMeshUrl).toHaveBeenCalledTimes(1);
    expect(settingsPermissionContext).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // Answer in the reverse of the old order: the page still waits for all three.
    ctx.resolve(null);
    mesh.resolve('https://signed/mesh');
    await tick();
    expect(done).toBe(false);
    rail.resolve(['wall', 'door']);

    renderToStaticMarkup((await page) as ReactElement);
    const props = vi.mocked(ProjectEditor).mock.calls[0]![0];
    expect(props.railOrder).toEqual(['wall', 'door']);
    expect(props.meshUrl).toBe('https://signed/mesh');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('each failed read is reported on its own and leaves its default', async () => {
    vi.mocked(loadRailOrder).mockRejectedValue(new Error('db down'));
    vi.mocked(projectMeshUrl).mockRejectedValue(new Error('db down'));
    vi.mocked(settingsPermissionContext).mockResolvedValue('failed');

    renderToStaticMarkup((await EditorPage({ params: Promise.resolve({ id: ID }) })) as ReactElement);
    const props = vi.mocked(ProjectEditor).mock.calls[0]![0];
    expect(props.railOrder).toEqual([]);
    expect('meshUrl' in props).toBe(false);
    expect('canSend' in props).toBe(false);
    const locations = vi.mocked(reportError).mock.calls.map((c) => (c[1] as { location: string }).location).sort();
    expect(locations).toEqual(['editor.mesh_link', 'editor.rail_order', 'editor.share_button']);
  });
});
