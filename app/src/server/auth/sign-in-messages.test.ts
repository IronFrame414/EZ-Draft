// EZD-007e T25, T37 (vault/plans/EZD-007e.md section 4).
import { describe, expect, expectTypeOf, it } from 'vitest';
import { NAMESPACES, languageFor } from '../../lib/messages/language';
import type { Language } from '../../lib/messages/types';
import { catalogFor } from '../messages/catalog';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';

const EN_TEXT: Record<string, string> = {
  'common.sign_in.title': 'Sign in to EZ Draft',
  'common.sign_in.email_label': 'Email',
  'common.sign_in.send': 'Email me a sign-in link',
  'common.sign_in.sent':
    'If {email} has EZ Draft access, we sent a sign-in link and a 6-digit code. Open the link, or type the code here.',
  'common.sign_in.check_spam': 'Not in your inbox? Check your spam or junk folder.',
  'common.sign_in.code_label': '6-digit code',
  'common.sign_in.code_submit': 'Sign in',
  'common.sign_in.change_email': 'Use a different email',
  'common.sign_in.confirm_title': 'Finish signing in',
  'common.sign_in.confirm_submit': 'Sign in',
  'common.sign_in.sign_out': 'Sign out',
  'common.sign_in.lang_en': 'English',
  'common.sign_in.lang_es': 'Español',
  'error.invalid_email': 'Enter a valid email address.',
  'error.too_many_requests': 'Too many tries. Wait a minute and try again.',
  'error.code_invalid': 'That code is wrong or has expired.',
  'error.link_invalid': 'This sign-in link has expired or was already used.',
  'error.no_access': "This account does not have access to EZ Draft. Ask your company's owner.",
  'error.not_signed_in': "You're signed out. Sign in again to continue.",
};

const enMap = en as Record<string, unknown>;
const esMap = es as Record<string, unknown>;

describe('EZD-007e sign-in catalogs', () => {
  it('EZD-007e done when: every sign-in string is in en and es and the sign_in surface serves them in both languages', () => {
    expect(Object.keys(EN_TEXT)).toHaveLength(19);
    for (const [key, text] of Object.entries(EN_TEXT)) expect(enMap[key], key).toBe(text);
    expect(esMap['common.sign_in.lang_en']).toBe('English');
    expect(esMap['common.sign_in.lang_es']).toBe('Español');
    for (const key of Object.keys(EN_TEXT)) {
      if (key === 'common.sign_in.lang_en' || key === 'common.sign_in.lang_es') continue;
      const s = esMap[key];
      expect(typeof s, key).toBe('string');
      expect((s as string).trim().length, key).toBeGreaterThan(0);
      expect(s, key).not.toBe(enMap[key]);
    }
    expect(esMap['common.sign_in.sent'] as string).toContain('{email}');
    expect(enMap['common.sign_in.back']).toBeUndefined();
    expect(esMap['common.sign_in.back']).toBeUndefined();

    for (const l of ['en', 'es'] as Language[]) {
      const source = l === 'en' ? enMap : esMap;
      const expected = Object.keys(source)
        .filter((k) => k.startsWith('common.') || k.startsWith('error.'))
        .sort();
      const served = catalogFor('sign_in', l) as Record<string, unknown>;
      expect(Object.keys(served).sort()).toEqual(expected);
      for (const k of expected) expect(served[k], k).toEqual(source[k]);
    }
  });
});

describe('EZD-007e sign_in surface typing', () => {
  it('T37 NAMESPACES.sign_in is common and error; languageFor refuses sign_in', () => {
    expect(NAMESPACES.sign_in).toEqual(['common', 'error']);
    // Never called: only the type error matters for pnpm typecheck.
    const neverCalled = () => {
      // @ts-expect-error 'sign_in' is not accepted by languageFor
      return languageFor('sign_in', { language: 'es' });
    };
    expect(typeof neverCalled).toBe('function');
    expectTypeOf<Parameters<typeof languageFor>[0]>().toEqualTypeOf<
      'office' | 'field' | 'client' | 'dev'
    >();
  });
});
