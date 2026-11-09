// EZD-120c U9 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-1). Expected values: plan Decided "Page" (a session
// is required; `devHooks` is true except when VERCEL_ENV is production; the project id comes from the route).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: vi.fn(async () => ({
    authUserId: 'a1',
    appUserId: 'u1',
    email: 'josh@example.com',
  })),
}));
vi.mock('../../../../editor/ProjectEditor', () => ({ ProjectEditor: vi.fn(() => null) }));

import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { requireSession } from '../../../../server/auth/session';
import EditorPage from './page';

const ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(ProjectEditor).mockClear();
  vi.mocked(requireSession).mockClear();
});

describe('EZD-120c editor page', () => {
  it('U9 page: requires a session and sets devHooks off only in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    renderToStaticMarkup(
      (await EditorPage({ params: Promise.resolve({ id: ID }) })) as ReactElement,
    );
    expect(requireSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ProjectEditor).mock.calls[0][0]).toEqual({ projectId: ID, devHooks: false });

    vi.mocked(ProjectEditor).mockClear();
    vi.stubEnv('VERCEL_ENV', 'preview');
    renderToStaticMarkup(
      (await EditorPage({ params: Promise.resolve({ id: ID }) })) as ReactElement,
    );
    expect(requireSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ProjectEditor).mock.calls[0][0]).toEqual({ projectId: ID, devHooks: true });
  });
});

// EZD-299 U7 (vault/plans/EZD-299.md section 4; AC-EZD-299-7; Decided D-Page): `?conflicts=open` opens the list; any
// other value, an array or no query leaves the props exactly as before.
describe('EZD-299 editor page conflicts query', () => {
  it('U7 only the exact string open adds conflictsOpen', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const propsFor = async (searchParams: Record<string, string | string[] | undefined>) => {
      vi.mocked(ProjectEditor).mockClear();
      renderToStaticMarkup(
        (await EditorPage({
          params: Promise.resolve({ id: ID }),
          searchParams: Promise.resolve(searchParams),
        })) as ReactElement,
      );
      return vi.mocked(ProjectEditor).mock.calls[0][0];
    };
    expect(await propsFor({ conflicts: 'open' })).toEqual({
      projectId: ID,
      devHooks: true,
      conflictsOpen: true,
    });
    expect(await propsFor({ conflicts: ['open'] })).toEqual({ projectId: ID, devHooks: true });
    expect(await propsFor({ conflicts: 'OPEN' })).toEqual({ projectId: ID, devHooks: true });
    expect(await propsFor({})).toEqual({ projectId: ID, devHooks: true });
  });
});
