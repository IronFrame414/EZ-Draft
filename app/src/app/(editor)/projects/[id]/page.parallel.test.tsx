// EZD-1994 (performance audit 2026-11-26, Q-0814; 11 Budgets "Open a project"): the editor page starts its four
// server reads (Import review check, rail order, mesh link, permissions) together, so the page waits for the slowest
// read and not for their sum. Each read is held open here; all four must have started before any of them answers.
// A failed read is still reported and leaves its default, and an open Import review still redirects, as before
// (EZD-230, EZD-503, EZD-111, EZD-1422).
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
vi.mock('../../../../server/field-measure/review-redirect', () => ({ fieldMeasureReviewJob: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { redirect } from 'next/navigation';
import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { fieldMeasureReviewJob } from '../../../../server/field-measure/review-redirect';
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
  vi.mocked(fieldMeasureReviewJob).mockReset();
  vi.mocked(redirect).mockClear();
});

describe('EZD-1994 AC-EZD-1994-2 editor page server reads run together', () => {
  it('all four reads have started before any of them answers', async () => {
    const review = held<string | null>();
    vi.mocked(fieldMeasureReviewJob).mockReturnValue(review.promise);
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
    expect(fieldMeasureReviewJob).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    // Answer in the reverse of the old order: the page still waits for all four.
    ctx.resolve(null);
    mesh.resolve('https://signed/mesh');
    await tick();
    expect(done).toBe(false);
    rail.resolve(['wall', 'door']);
    await tick();
    expect(done).toBe(false);
    review.resolve(null);

    renderToStaticMarkup((await page) as ReactElement);
    const props = vi.mocked(ProjectEditor).mock.calls[0]![0];
    expect(props.railOrder).toEqual(['wall', 'door']);
    expect(props.meshUrl).toBe('https://signed/mesh');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('AC-EZD-1994-3 each failed read is reported on its own and leaves its default', async () => {
    vi.mocked(fieldMeasureReviewJob).mockRejectedValue(new Error('db down'));
    vi.mocked(loadRailOrder).mockRejectedValue(new Error('db down'));
    vi.mocked(projectMeshUrl).mockRejectedValue(new Error('db down'));
    vi.mocked(settingsPermissionContext).mockResolvedValue('failed');

    renderToStaticMarkup((await EditorPage({ params: Promise.resolve({ id: ID }) })) as ReactElement);
    const props = vi.mocked(ProjectEditor).mock.calls[0]![0];
    expect(props.railOrder).toEqual([]);
    expect('meshUrl' in props).toBe(false);
    expect('canSend' in props).toBe(false);
    const locations = vi.mocked(reportError).mock.calls.map((c) => (c[1] as { location: string }).location).sort();
    expect(locations).toEqual([
      'editor.field_measure_review',
      'editor.mesh_link',
      'editor.rail_order',
      'editor.share_button',
    ]);
  });

  it('AC-EZD-1994-3 an open Import review still opens it, with the other reads already started', async () => {
    vi.mocked(fieldMeasureReviewJob).mockResolvedValue('job-7');
    vi.mocked(loadRailOrder).mockResolvedValue([]);
    vi.mocked(projectMeshUrl).mockResolvedValue(null);
    vi.mocked(settingsPermissionContext).mockResolvedValue(null);

    await expect(EditorPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
      `NEXT_REDIRECT /projects/${ID}/import/job-7`,
    );
    expect(redirect).toHaveBeenCalledWith(`/projects/${ID}/import/job-7`);
    expect(ProjectEditor).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
