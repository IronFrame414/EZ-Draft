// EZD-034 T1, T9 (vault/plans/EZD-034.md Tests; Steps 1 and 2; section 6 wording; R-013 (5), (6); Q-0030 (a)):
// captchaConfig reads the site key per call; the two captcha messages exist in en and es.
import { describe, expect, it } from 'vitest';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';
import { TURNSTILE_SCRIPT_URL, TURNSTILE_TEST_SITE_KEY, captchaConfig } from './captcha-config';

describe('EZD-034 captcha config', () => {
  it('EZD-034 T1 an empty or missing site key is null; a key is trimmed', () => {
    expect(TURNSTILE_SCRIPT_URL).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    );
    expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA');
    expect(captchaConfig({})).toBeNull();
    expect(captchaConfig({ TURNSTILE_SITE_KEY: '' })).toBeNull();
    expect(captchaConfig({ TURNSTILE_SITE_KEY: '  ' })).toBeNull();
    expect(captchaConfig({ TURNSTILE_SITE_KEY: ' 0xAB ' })).toEqual({
      siteKey: '0xAB',
      scriptUrl: TURNSTILE_SCRIPT_URL,
    });
  });

  it('EZD-034 T9 the captcha messages exist in en (section 6 text) and es', () => {
    const e = en as Record<string, unknown>;
    const s = es as Record<string, unknown>;
    expect(e['error.captcha_failed']).toBe("The security check didn't go through. Try again.");
    expect(e['error.captcha_unavailable']).toBe(
      "The security check didn't load. Check your connection and reload the page.",
    );
    for (const key of ['error.captcha_failed', 'error.captcha_unavailable']) {
      expect(typeof s[key]).toBe('string');
      expect((s[key] as string).length).toBeGreaterThan(0);
      expect(s[key]).not.toBe(e[key]);
    }
  });
});
