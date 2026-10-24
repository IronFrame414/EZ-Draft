// EZD-007d T10 (vault/plans/EZD-007d.md sections 3 and 4; parent P-T10, Step 5): the pages that need no
// session. smoke: yes.
import { describe, expect, it } from 'vitest';
import { isPublicPath, PUBLIC_PATHS } from './public-paths';

describe('EZD-007d public paths', () => {
  it('EZD-007d T10 public paths @smoke', () => {
    for (const p of ['/sign-in', '/auth/confirm', '/api/health', '/api/anything', '/dev/tokens']) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of ['/', '/projects', '/sign-in-x', '/auth', '/devx', '/settings/users']) {
      expect(isPublicPath(p), p).toBe(false);
    }
    expect(PUBLIC_PATHS).toEqual(['/sign-in', '/auth/confirm', '/api', '/dev']);
  });
});
