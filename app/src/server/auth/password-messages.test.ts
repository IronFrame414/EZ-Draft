// EZD-033 T19 (vault/plans/EZD-033.md Tests; Step 7): the nine new catalog entries. English text: Q-0091
// (the three buttons, the label and the wrong-password error) and Q-0101 (Josh's four throttle messages,
// verbatim). Each new key has Spanish text that is non-empty and differs from the English (Q-0030, R24 #40).
// The old Q-0046 (a) and Q-0086 (a) values stay.
import { describe, expect, it } from 'vitest';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';

const E = en as Record<string, unknown>;
const S = es as Record<string, unknown>;

const NEW_KEYS: Record<string, string> = {
  'common.sign_in.password_label': 'Password',
  'common.sign_in.password_submit': 'Sign in',
  'common.sign_in.send_instead': 'Email me a sign-in link instead',
  'common.sign_in.forgot': 'Forgot password? Email me a code',
  'error.password_wrong': 'Email or password is wrong.',
  'error.password_throttled':
    "Too many wrong passwords. Use 'Forgot password? Email me a code', or try again in 15 minutes.",
  'error.code_throttled': 'Too many wrong codes. Try again in 15 minutes.',
  'error.email_throttled': 'Too many sign-in emails. Try again in an hour.',
  'error.ip_throttled': 'Too many sign-in tries from this network. Try again in 15 minutes.',
};

describe('EZD-033 catalog entries', () => {
  it('EZD-033 T19 English text of the nine new keys', () => {
    for (const [key, text] of Object.entries(NEW_KEYS)) expect(E[key], key).toBe(text);
  });

  it('EZD-033 T19 each new key has Spanish text that differs from the English', () => {
    for (const key of Object.keys(NEW_KEYS)) {
      const spanish = S[key];
      expect(typeof spanish, key).toBe('string');
      expect((spanish as string).trim().length, key).toBeGreaterThan(0);
      expect(spanish, key).not.toBe(E[key]);
    }
  });

  it('EZD-033 T19 earlier keys keep their text', () => {
    expect(E['common.sign_in.send']).toBe('Email me a sign-in link');
    expect(E['error.db_unavailable']).toBe("Can't reach the database. Try again in a minute.");
  });
});
