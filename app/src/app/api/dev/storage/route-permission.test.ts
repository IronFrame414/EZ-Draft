// EZD-132 T18 (b) (vault/plans/EZD-132.md section 4; Decided Dev routes; ARCH-PE 403 body; Q-0202; EZD-102 U8):
// with a session but no edit_model switch, both dev storage routes answer the permission 403 and touch no
// storage helper. Own file: its module mocks would replace the real requireApiSession that route.test.ts runs
// for the 401 case. Mock pattern: app/src/app/(office)/settings/settings-pages.test.tsx.
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock('../../../../server/auth/session', () => ({
  requireApiSession: vi.fn(async () => ({
    authUserId: 'a1',
    appUserId: 'u1',
    email: 'a@example.test',
  })),
}));
vi.mock('../../../../server/permissions', async (orig) => ({
  ...(await orig<typeof import('../../../../server/permissions')>()),
  requireApiPermission: vi.fn(async () =>
    Response.json(
      { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    ),
  ),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../../server/storage', async (orig) => ({
  ...(await orig<typeof import('../../../../server/storage')>()),
  startSourceFileUpload: vi.fn(),
  completeSourceFileUpload: vi.fn(),
  signedDownloadUrl: vi.fn(),
}));

import { requireApiPermission } from '../../../../server/permissions';
import {
  completeSourceFileUpload,
  signedDownloadUrl,
  startSourceFileUpload,
} from '../../../../server/storage';
import { POST as complete } from './[id]/complete/route';
import { POST as start } from './route';

const MOCKED_BODY = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-132 dev storage routes permission', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-132 T18 (b) start answers 403 and starts nothing without edit_model on the project', async () => {
    const projectId = randomUUID();
    const res = await start(
      new Request('http://localhost/api/dev/storage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          kind: 'pdf',
          originalName: 'plan.pdf',
          contentType: 'application/pdf',
          size: 7340155,
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(MOCKED_BODY);
    expect(requireApiPermission).toHaveBeenCalledTimes(1);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model', { projectId });
    expect(startSourceFileUpload).not.toHaveBeenCalled();
  });

  it('EZD-132 T18 (b) complete answers 403 and completes nothing without edit_model', async () => {
    const id = randomUUID();
    const res = await complete(
      new Request(`http://localhost/api/dev/storage/${id}/complete`, { method: 'POST' }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledTimes(1);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    expect(completeSourceFileUpload).not.toHaveBeenCalled();
    expect(signedDownloadUrl).not.toHaveBeenCalled();
  });
});
