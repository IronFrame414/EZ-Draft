// EZD-1991 (Q-0813; AC-EZD-1991-1 "Open Sheets opens the Sheets screen"): `?view=sheets` opens the editor on its
// Sheets screen; any other value, an array or no query leaves the props as before. Mocks as page.test.tsx.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: vi.fn(async () => ({ authUserId: 'a1', appUserId: 'u1', email: 'josh@example.com' })),
}));
vi.mock('../../../../editor/ProjectEditor', () => ({ ProjectEditor: vi.fn(() => null) }));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: vi.fn(() => ({})) }));
vi.mock('../../../../server/imports/project-mesh', () => ({ projectMeshUrl: vi.fn(async () => null) }));
vi.mock('../../../../server/profile/rail-order', () => ({ loadRailOrder: vi.fn(async () => ['wall']) }));
vi.mock('../../../../server/settings/shell-data', () => ({
  settingsPermissionContext: vi.fn(async () => null),
}));

import { ProjectEditor } from '../../../../editor/ProjectEditor';
import EditorPage from './page';

const ID = '11111111-1111-4111-8111-111111111111';
const BASE = { projectId: ID, railOrder: ['wall'], devHooks: true };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(ProjectEditor).mockClear();
});

describe('EZD-1991 editor page view query', () => {
  it('only the exact string sheets adds initialView sheets', async () => {
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
    expect(await propsFor({ view: 'sheets' })).toEqual({ ...BASE, initialView: 'sheets' });
    expect(await propsFor({ view: ['sheets'] })).toEqual(BASE);
    expect(await propsFor({ view: 'plan' })).toEqual(BASE);
    expect(await propsFor({ view: '3d' })).toEqual(BASE);
    expect(await propsFor({})).toEqual(BASE);
  });
});
