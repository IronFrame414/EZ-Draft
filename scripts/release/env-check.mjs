// EZD-023c Step 2 (vault/plans/EZD-023c.md): pure rules on the Vercel environment values. EZD-021 extends
// `evaluateVercelEnv` and `DECRYPTED_ENTRIES`; EZD-025 imports `supabaseRefFromDbUrl`.

/** The only values the release reads decrypted. */
export const DECRYPTED_ENTRIES = Object.freeze([
  Object.freeze({ key: 'NEXT_PUBLIC_SUPABASE_URL', target: 'production' }),
  Object.freeze({ key: 'NEXT_PUBLIC_SUPABASE_URL', target: 'preview' }),
  Object.freeze({ key: 'EMAIL_TRANSPORT', target: 'preview' }),
  Object.freeze({ key: 'AI_MODE', target: 'preview' }),
]);

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function supabaseRefFromApiUrl(url) {
  if (typeof url !== 'string') return null;
  const u = parse(url);
  if (!u || u.protocol !== 'https:') return null;
  const m = /^([a-z0-9]+)\.supabase\.co$/.exec(u.hostname);
  return m ? m[1] : null;
}

export function supabaseRefFromDbUrl(url) {
  if (typeof url !== 'string') return null;
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname;
  if (host.endsWith('.pooler.supabase.com')) {
    let user;
    try {
      user = decodeURIComponent(u.username);
    } catch {
      return null;
    }
    const m = /^postgres\.([a-z0-9]+)$/.exec(user);
    return m ? m[1] : null;
  }
  const m = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  return m ? m[1] : null;
}

export function envExampleNames(text) {
  const names = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!m) throw new Error('env_example_invalid');
    names.push(m[1]);
  }
  return names;
}

const TARGETS = ['production', 'preview', 'development'];
const targetsOf = (e) => {
  const t = Array.isArray(e?.target) ? e.target : [e?.target];
  return t.filter((x) => TARGETS.includes(x));
};
const has = (e, target) => targetsOf(e).includes(target);

export function evaluateVercelEnv({ envs, requiredNames, prodRef }) {
  const list = Array.isArray(envs) ? envs : [];
  const required = Array.isArray(requiredNames) ? requiredNames : [];
  const problems = [];
  const seen = new Set();
  const add = (code, name, target) => {
    const k = `${code}|${name}|${target}`;
    if (seen.has(k)) return;
    seen.add(k);
    problems.push({ code, name, target });
  };
  const of = (key, target) => list.filter((e) => e?.key === key && has(e, target));
  const refKnown = typeof prodRef === 'string' && prodRef !== '';

  // 1
  if (!refKnown) add('prod_ref_unknown', 'BACKUP_SOURCE_DB_URL', null);
  // 2
  for (const name of required) if (of(name, 'production').length === 0) add('missing', name, 'production');
  // 3
  const previewNames = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'EMAIL_FROM',
  ];
  if (required.includes('SUPABASE_API_GATE_SECRET')) previewNames.push('SUPABASE_API_GATE_SECRET');
  for (const name of previewNames) if (of(name, 'preview').length === 0) add('missing', name, 'preview');
  // 4 and 5
  if (refKnown) {
    for (const e of of('NEXT_PUBLIC_SUPABASE_URL', 'production')) {
      const ref = supabaseRefFromApiUrl(e.value);
      if (ref === null) add('unreadable', 'NEXT_PUBLIC_SUPABASE_URL', 'production');
      else if (ref !== prodRef) add('production_not_prod', 'NEXT_PUBLIC_SUPABASE_URL', 'production');
    }
    for (const e of of('NEXT_PUBLIC_SUPABASE_URL', 'preview')) {
      const ref = supabaseRefFromApiUrl(e.value);
      if (ref === null) add('unreadable', 'NEXT_PUBLIC_SUPABASE_URL', 'preview');
      else if (ref === prodRef) add('preview_uses_prod', 'NEXT_PUBLIC_SUPABASE_URL', 'preview');
    }
  }
  // 6
  const transports = of('EMAIL_TRANSPORT', 'preview');
  const okMode = (v) => v === 'stub' || v === 'resend';
  if (transports.length === 0 || transports.some((e) => !okMode(e.value))) {
    add('preview_email', 'EMAIL_TRANSPORT', 'preview');
  }
  if (transports.some((e) => e.value === 'resend') && of('RESEND_API_KEY', 'preview').length === 0) {
    add('preview_email', 'RESEND_API_KEY', 'preview');
  }
  // 6b (EZD-021 Step 6; Q-0077): when AI_MODE is a required name, the Preview value is set explicitly to
  // stub or live.
  if (required.includes('AI_MODE')) {
    const aiModes = of('AI_MODE', 'preview');
    const okAi = (v) => v === 'stub' || v === 'live';
    if (aiModes.length === 0 || aiModes.some((e) => !okAi(e.value))) {
      add('preview_ai_mode', 'AI_MODE', 'preview');
    }
  }
  // 7
  const stub = list.filter((e) => e?.key === 'EMAIL_STUB_DIR');
  if (stub.some((e) => has(e, 'production'))) add('stub_dir_set', 'EMAIL_STUB_DIR', 'production');
  if (stub.some((e) => has(e, 'preview'))) add('stub_dir_set', 'EMAIL_STUB_DIR', 'preview');

  return { ok: problems.length === 0, problems };
}
