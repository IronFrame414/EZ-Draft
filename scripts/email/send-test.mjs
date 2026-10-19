// Live email check. Run by hand only: node scripts/email/send-test.mjs --to <address>
// Never run by the gate (EZD-008b; Q-0153). Node 22 built-ins only.
import { pathToFileURL } from 'node:url';

export const RESEND_URL = 'https://api.resend.com/emails';
export const APP_URL = 'https://ezdraft.ezcontractorbinder.com/';
export const SUBJECT = 'EZ Draft email check';

const SENTENCE =
  'This is a test email from EZ Draft. If it is in your inbox and not in spam, email is set up.';
const ADDRESS = /^[^\s@]+@[^\s@]+$/;

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseArgs(argv) {
  let to = null;
  const unknown = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--to') {
      if (i + 1 < argv.length) {
        to = argv[i + 1];
        i += 1;
      } else {
        unknown.push(arg);
      }
    } else if (arg.startsWith('--to=')) {
      to = arg.slice('--to='.length);
    } else {
      unknown.push(arg);
    }
  }
  return { to, unknown };
}

export function buildTestRequest({ to, from, appUrl, apiKey }) {
  const url = escapeHtml(appUrl);
  return {
    url: RESEND_URL,
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: SUBJECT,
      text: `${SENTENCE}\n\n${appUrl}\n`,
      html: `<!doctype html><html lang="en"><body><p>${escapeHtml(SENTENCE)}</p><p><a href="${url}">Open EZ Draft</a></p><p>${url}</p></body></html>`,
    }),
  };
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
      'send-test.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Email, step 5).',
    );
    return 1;
  }
  const { to, unknown } = parseArgs(argv);
  if (to === null || unknown.length > 0) {
    io.error('Usage: node scripts/email/send-test.mjs --to <your email address>');
    return 1;
  }
  if (!ADDRESS.test(to)) {
    io.error('--to must be one email address.');
    return 1;
  }
  if (!nonEmpty(env.RESEND_API_KEY)) {
    io.error('RESEND_API_KEY is not set in this terminal (docs/runbook.md, Email, step 5).');
    return 1;
  }
  if (!nonEmpty(env.EMAIL_FROM)) {
    io.error('EMAIL_FROM is not set in this terminal (docs/runbook.md, Email, step 5).');
    return 1;
  }
  const { url, method, headers, body } = buildTestRequest({
    to,
    from: env.EMAIL_FROM,
    appUrl: APP_URL,
    apiKey: env.RESEND_API_KEY,
  });
  let response;
  try {
    response = await fetchImpl(url, { method, headers, body });
  } catch (err) {
    io.error(`Could not reach Resend: ${err instanceof Error ? err.name : 'Error'}.`);
    return 1;
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const name = json && typeof json.name === 'string' ? ` ${json.name}` : '';
    io.error(`Resend refused the email: HTTP ${response.status}${name}.`);
    return 1;
  }
  if (!json || typeof json.id !== 'string') {
    io.error(`Resend answered without a message id (HTTP ${response.status}).`);
    return 1;
  }
  io.log(`Sent. Resend message id: ${json.id}. Check your inbox (docs/runbook.md, Email, step 5).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), process.env, globalThis.fetch);
}
