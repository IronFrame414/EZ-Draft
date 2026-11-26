// EZD-503 (S05 Read heights from scan "Only when a GLB mesh exists for the project"): the editor page passes the
// project's signed GLB link to the editor when there is one, and reports a failed read without passing one.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../server/auth/session', () => ({
  requireSession: vi.fn(async () => ({
    authUserId: 'a1',
    appUserId: 'u1',
    email: 'm@example.com',
  })),
}));
vi.mock('../../../../editor/ProjectEditor', () => ({ ProjectEditor: vi.fn(() => null) }));
vi.mock('../../../../server/auth/supabase-server', () => ({
  createSessionClient: vi.fn(() => ({})),
}));
vi.mock('../../../../server/profile/rail-order', () => ({ loadRailOrder: vi.fn(async () => []) }));
vi.mock('../../../../server/settings/shell-data', () => ({
  settingsPermissionContext: vi.fn(async () => null),
}));
vi.mock('../../../../server/imports/project-mesh', () => ({ projectMeshUrl: vi.fn() }));
vi.mock('../../../../server/errors/report', () => ({ reportError: vi.fn(async () => ({})) }));
vi.mock('../../../../server/field-measure/review-redirect', () => ({
  fieldMeasureReviewJob: vi.fn(async () => null),
}));

import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { reportError } from '../../../../server/errors/report';
import { projectMeshUrl } from '../../../../server/imports/project-mesh';
import EditorPage from './page';

const ID = '11111111-1111-4111-8111-111111111111';

const props = async () => {
  vi.mocked(ProjectEditor).mockClear();
  renderToStaticMarkup((await EditorPage({ params: Promise.resolve({ id: ID }) })) as ReactElement);
  return vi.mocked(ProjectEditor).mock.calls[0][0];
};

afterEach(() => vi.mocked(reportError).mockClear());

describe('EZD-503 editor page mesh link', () => {
  it('passes the signed GLB link when the project has one', async () => {
    vi.mocked(projectMeshUrl).mockResolvedValue('https://signed/mesh');
    expect((await props()).meshUrl).toBe('https://signed/mesh');
    expect(vi.mocked(projectMeshUrl).mock.calls.at(-1)?.[1]).toBe(ID);
  });

  it('passes none without a GLB, and none (reported) when the read fails', async () => {
    vi.mocked(projectMeshUrl).mockResolvedValue(null);
    expect('meshUrl' in (await props())).toBe(false);
    vi.mocked(projectMeshUrl).mockRejectedValue(new Error('db down'));
    expect('meshUrl' in (await props())).toBe(false);
    expect(vi.mocked(reportError).mock.calls[0]?.[1]).toEqual({
      source: 'function',
      location: 'editor.mesh_link',
    });
  });
});
