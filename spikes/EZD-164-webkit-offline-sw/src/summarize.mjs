// EZD-164 Step 9 (vault/plans/EZD-164.md D-Summary): turns the run log into the yes or no summary.
const IDS = [
  'registered',
  'controlled',
  'cached',
  'offline_flag',
  'offline_reload',
  'same_render',
  'controlled_offline',
  'hydrated_offline',
  'uncached_fails',
];
const PROJECTS = ['desktop', 'ipad-landscape', 'phone'];
const VARIANTS = ['V1', 'V2'];
const MARK = 'EZD-164 RESULT ';

function valid(r) {
  if (r === null || typeof r !== 'object') return false;
  if (typeof r.browser !== 'string' || r.browser === '') return false;
  if (typeof r.version !== 'string' || r.version === '') return false;
  const c = r.checks;
  if (c === null || typeof c !== 'object') return false;
  const keys = Object.keys(c);
  if (keys.length !== IDS.length || !IDS.every((id) => keys.includes(id))) return false;
  return IDS.every((id) => typeof c[id] === 'boolean');
}

export function summarize(log) {
  const found = new Map();
  for (const text of log.split('\n')) {
    const at = text.indexOf(MARK);
    if (at < 0) continue;
    let r;
    try {
      r = JSON.parse(text.slice(at + MARK.length));
    } catch {
      throw new Error('bad_result: unparsable');
    }
    const key = `${r?.project}/${r?.variant}`;
    if (found.has(key)) throw new Error(`duplicate_result: ${key}`);
    if (!valid(r)) throw new Error(`bad_result: ${key}`);
    found.set(key, r);
  }
  const results = [];
  for (const p of PROJECTS) {
    for (const v of VARIANTS) {
      const r = found.get(`${p}/${v}`);
      if (!r) throw new Error(`missing_result: ${p}/${v}`);
      results.push(r);
    }
  }
  const failedWebkitChecks = [];
  for (const r of results) {
    if (r.project === 'desktop') continue;
    for (const id of IDS) if (!r.checks[id]) failedWebkitChecks.push(`${r.project}/${r.variant}/${id}`);
  }
  const chromiumControl = results
    .filter((r) => r.project === 'desktop')
    .every((r) => IDS.every((id) => r.checks[id]))
    ? 'pass'
    : 'fail';
  return {
    verdict: failedWebkitChecks.length === 0 ? 'yes' : 'no',
    chromiumControl,
    failedWebkitChecks,
    results,
  };
}

export function redact(text, secrets) {
  let out = text;
  for (const s of secrets) if (s !== '') out = out.split(s).join('<redacted>');
  return out;
}
