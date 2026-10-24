// Captcha hand check. Run by hand only: node scripts/auth/captcha-check.mjs
// Never run by the gate or CI (EZD-034; Q-0153; Q-0243 (c)). Node 22 built-ins only.
// Asks Supabase Auth for a sign-in code without a captcha token; PASS when Auth refuses it
// with HTTP 400 captcha_failed, so captcha protection is on for the project.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const CHECK_EMAIL_DOMAIN = 'example.invalid';

export function buildCheckRequest({ url, key, email }) {
  return {
    url: `${url.replace(/\/+$/, '')}/auth/v1/otp`,
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: true }),
  };
}

export function readAuthErrorCode(json) {
  if (json === null || typeof json !== 'object') return null;
  if (typeof json.error_code === 'string') return json.error_code;
  if (typeof json.code === 'string') return json.code;
  return null;
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

export async function main(
  argv,
  env,
  fetchImpl,
  io = {
    log: (line) => process.stdout.write(`${line}\n`),
    error: (line) => process.stderr.write(`${line}\n`),
  },
) {
  if (nonEmpty(env.CI)) {
    io.error(
      'captcha-check.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Captcha, step 5).',
    );
    return 1;
  }
  if (argv.length > 0) {
    io.error(
      'Usage: node scripts/auth/captcha-check.mjs (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY first)',
    );
    return 1;
  }
  if (!nonEmpty(env.NEXT_PUBLIC_SUPABASE_URL) || !nonEmpty(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
    io.error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set in this terminal (docs/runbook.md, Captcha, step 5).',
    );
    return 1;
  }
  const email = `captcha-check-${randomBytes(4).toString('hex')}@${CHECK_EMAIL_DOMAIN}`;
  const { url, method, headers, body } = buildCheckRequest({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    email,
  });
  let response;
  try {
    response = await fetchImpl(url, { method, headers, body });
  } catch (err) {
    io.error(`Could not reach Supabase Auth: ${err instanceof Error ? err.name : 'Error'}.`);
    return 1;
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  const code = readAuthErrorCode(json);
  if (response.status === 400 && code === 'captcha_failed') {
    io.log(
      'PASS: Supabase Auth refused a sign-in code request without a captcha token (HTTP 400 captcha_failed).',
    );
    return 0;
  }
  io.error(
    `FAIL: expected HTTP 400 captcha_failed, got HTTP ${response.status} ${code ?? 'none'}. Captcha protection is not on for this project.`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env, globalThis.fetch);
}
