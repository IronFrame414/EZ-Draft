// EZD-003 live check of https://ezdraft.ezcontractorbinder.com (vault/plans/EZD-003.md Step 2).
// Never run by the gate (offline). EZD-023b imports HOST, observe and evaluate.
import { pathToFileURL } from 'node:url';

export const HOST = 'ezdraft.ezcontractorbinder.com';

const IDS = ['dns', 'tls', 'status', 'host', 'vercel', 'title', 'hsts', 'redirect'];
const DNS_CODES = ['ENOTFOUND', 'EAI_AGAIN'];

export async function observe(host) {
  const obs = {};
  try {
    const res = await fetch('https://' + host + '/', { redirect: 'follow' });
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    obs.https = { status: res.status, finalUrl: res.url, headers, body: await res.text() };
  } catch (e) {
    obs.https = { error: { code: e?.cause?.code ?? e?.code ?? 'UNKNOWN' } };
  }
  try {
    const res = await fetch('http://' + host + '/', { redirect: 'manual' });
    obs.http = { status: res.status, location: res.headers.get('location') ?? undefined };
  } catch (e) {
    obs.http = { error: { code: e?.cause?.code ?? e?.code ?? 'UNKNOWN' } };
  }
  return obs;
}

export function evaluate(obs) {
  const https = obs.https ?? {};
  const http = obs.http ?? {};
  const code = https.error?.code;
  const dnsFail = code !== undefined && DNS_CODES.includes(code);
  const tlsFail = code !== undefined && !dnsFail;
  const results = [];
  const add = (id, pass, detail) => results.push({ id, pass, detail });

  add('dns', !dnsFail, dnsFail ? `DNS lookup failed (${code}); see the DNS record item in vault/tickets/needs-from-josh.md` : 'resolves');
  if (dnsFail) {
    for (const id of IDS.slice(1)) add(id, false, 'skipped');
    return { ok: false, results };
  }
  add('tls', !tlsFail, tlsFail ? `connection or certificate error (${code})` : 'ok');
  if (tlsFail) {
    for (const id of IDS.slice(2)) add(id, false, 'skipped');
    return { ok: false, results };
  }

  add('status', https.status === 200, `status ${https.status}`);

  let hostOk = false;
  try {
    const u = new URL(https.finalUrl);
    hostOk = u.protocol === 'https:' && u.hostname === HOST;
  } catch {
    hostOk = false;
  }
  add('host', hostOk, `final url ${https.finalUrl}`);

  const server = String(https.headers?.server ?? '').toLowerCase();
  add('vercel', server === 'vercel', `server ${server || 'missing'}`);

  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(https.body ?? ''));
  add('title', !!m && m[1].includes('EZ Draft'), m ? `title ${m[1].trim()}` : 'no title');

  const hsts = https.headers?.['strict-transport-security'];
  const age = /max-age=(\d+)/i.exec(String(hsts ?? ''));
  add('hsts', !!age && Number(age[1]) > 0, hsts ? `hsts ${hsts}` : 'missing');

  const loc = String(http.location ?? '');
  add(
    'redirect',
    http.status === 308 && loc.startsWith('https://' + HOST),
    `http ${http.status} ${loc}`.trim(),
  );

  return { ok: results.every((r) => r.pass), results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, results } = evaluate(await observe(HOST));
  for (const r of results) process.stdout.write(`${r.id} ${r.pass ? 'PASS' : 'FAIL'} ${r.detail}\n`);
  process.exit(ok ? 0 : 1);
}
