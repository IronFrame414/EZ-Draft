// EZD-120d U6 (vault/plans/EZD-120d.md section 4, Decided "Test page"; AC-EZD-120d-5; Q-0505). In production the
// page is not found; otherwise it renders `SaveBench` for the project in the route. Not-found is matched by its
// digest as in app/src/app/entry-groups.test.tsx.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../../../../../server/auth/session', () => ({
  requireSession: vi.fn(async () => ({
    authUserId: 'a1',
    appUserId: 'u1',
    email: 'josh@example.com',
  })),
}));
vi.mock('./SaveBench', () => ({ SaveBench: vi.fn(() => null) }));

import { SaveBench } from './SaveBench';
import Page from './page';

const ID = '11111111-1111-4111-8111-111111111111';
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(SaveBench).mockClear();
});

describe('EZD-120d save test page', () => {
  it('U6 is not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page({ params: Promise.resolve({ id: ID }) });
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe(NOT_FOUND);
    expect(SaveBench).not.toHaveBeenCalled();
  });

  it('U6 renders SaveBench for the project in a preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    renderToStaticMarkup((await Page({ params: Promise.resolve({ id: ID }) })) as ReactElement);
    expect(vi.mocked(SaveBench).mock.calls[0][0]).toEqual({ projectId: ID });
  });
});
