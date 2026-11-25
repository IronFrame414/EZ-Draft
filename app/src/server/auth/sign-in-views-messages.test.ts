// EZD-1961 (Q-0800; AC-EZD-1961-1, AC-EZD-1961-3): the two new sign-in catalog entries. "Back" is the word
// AC-EZD-1961-1 names; "Email me a code" is the forgot-password view's send button, from the Q-0091 link text
// "Forgot password? Email me a code" (both listed in vault/build/assumptions.md for Josh). Each has Spanish
// text that is non-empty and differs from the English (Q-0030).
import { describe, expect, it } from 'vitest';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';

const E = en as Record<string, unknown>;
const S = es as Record<string, unknown>;

const NEW_KEYS: Record<string, string> = {
  'common.sign_in.way_back': 'Back',
  'common.sign_in.send_code': 'Email me a code',
};

describe('EZD-1961 catalog entries', () => {
  it('EZD-1961 English text of the new keys', () => {
    for (const [key, text] of Object.entries(NEW_KEYS)) expect(E[key], key).toBe(text);
  });

  it('EZD-1961 each new key has Spanish text that differs from the English', () => {
    for (const key of Object.keys(NEW_KEYS)) {
      const spanish = S[key];
      expect(typeof spanish, key).toBe('string');
      expect((spanish as string).trim().length, key).toBeGreaterThan(0);
      expect(spanish, key).not.toBe(E[key]);
    }
  });
});
