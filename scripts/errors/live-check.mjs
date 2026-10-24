// EZD-024 Step 11 (vault/plans/EZD-024.md): the live error-reporting check Josh runs by hand once after the
// first release (docs/runbook.md `## Error reporting (EZD-024)` step 6). It posts one envelope to the live
// tunnel and prints its code; Josh then sees one Sentry issue and one alert email with that code. Node 22
// built-ins only. Never run by the gate: it refuses to run when CI is set.
import { randomInt, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';
export const TUNNEL_URL = 'https://ezdraft.ezcontractorbinder.com/api/monitoring';

function randomNonce() {
  return Array.from({ length: 12 }, () => String.fromCharCode(97 + randomInt(26))).join('');
}

// One envelope in the Sentry envelope format: header line, item header, JSON payload.
export function buildCheckEnvelope({ nonce }) {
  const eventId = randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const lines = [
    { dsn: PLACEHOLDER_DSN, event_id: eventId, sent_at: now },
    { type: 'event' },
    {
      event_id: eventId,
      timestamp: now,
      platform: 'javascript',
      level: 'error',
      exception: { values: [{ type: 'Error', value: `EZD-024 live check ${nonce}` }] },
      request: { url: 'https://ezdraft.ezcontractorbinder.com/live-check' },
      tags: { 'ezd.source': 'browser' },
    },
  ];
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
}

export async function main(argv, env, fetchImpl) {
  if (env.CI) {
    process.stderr.write('live-check refuses to run under CI; Josh runs it by hand.\n');
    return 1;
  }
  const nonce = argv[0] && /^[a-z]{12}$/.test(argv[0]) ? argv[0] : randomNonce();
  let res;
  try {
    res = await fetchImpl(TUNNEL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: buildCheckEnvelope({ nonce }),
    });
  } catch {
    process.stderr.write('Could not reach the live site.\n');
    return 1;
  }
  if (res.status !== 200) {
    process.stderr.write(`The tunnel answered ${res.status}.\n`);
    return 1;
  }
  process.stdout.write(`Sent. Code: ${nonce}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2), process.env, globalThis.fetch);
}
