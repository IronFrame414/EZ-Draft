// EZD-034 Step 1 (vault/plans/EZD-034.md section 3; Q-0175 (b); Q-0243 (c); R-013 (5), (6)): the sign-in
// security check (Cloudflare Turnstile through Supabase Auth's captcha). The site key is read per request and
// passed to the page as a prop; an empty or missing key means no widget. This is the only app file that names
// Cloudflare's host.

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Cloudflare's published always-pass test site key, used only by the /dev/captcha test page.
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

// The same-origin stub script the /dev/captcha test page loads in place of Cloudflare's.
export const DEV_CAPTCHA_STUB_URL = '/dev/captcha/stub';

export type CaptchaConfig = { siteKey: string; scriptUrl: string };

export function captchaConfig(env: Record<string, string | undefined>): CaptchaConfig | null {
  const siteKey = (env.TURNSTILE_SITE_KEY ?? '').trim();
  if (siteKey === '') return null;
  return { siteKey, scriptUrl: TURNSTILE_SCRIPT_URL };
}
