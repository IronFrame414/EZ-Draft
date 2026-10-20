// EZD-007f T39 (vault/plans/EZD-007f.md sections 3, 4; P-Step 5 "If it returns false, nothing is
// submitted"; L-012): confirmSignOut is true with no hook, else the hook's awaited result. No database.
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../server/auth/actions', () => ({
  signOut: vi.fn(),
  requestSignIn: vi.fn(),
  verifySignInCode: vi.fn(),
  confirmSignInLink: vi.fn(),
  setSignInLanguage: vi.fn(),
  clearSignInEmail: vi.fn(),
}));

import { confirmSignOut } from './SignOutButton';

describe('EZD-007f SignOutButton', () => {
  test('EZD-007f T39 beforeSignOut refusal: confirmSignOut follows the hook', async () => {
    expect(await confirmSignOut()).toBe(true);
    expect(await confirmSignOut(() => false)).toBe(false);
    expect(await confirmSignOut(async () => false)).toBe(false);
    expect(await confirmSignOut(async () => true)).toBe(true);
  });
});
