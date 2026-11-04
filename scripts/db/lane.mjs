// EZD-172 Step 1 (vault/plans/EZD-172.md; Interface contract): build lanes. Lane 0 is today's single
// local stack; lanes 1-3 each get their own Supabase project folder (.lanes/lane<n>/), project id,
// stack ports and app ports. Node 22 built-ins only.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MAX_LANE = 3;
export const STACK_PORT_STEP = 100;
export const APP_PORT_STEP = 10;
export const BASE_WEB_PORT = 3000;
export const BASE_PERF_PORT = 3200;
export const LANES_DIR = '.lanes';

const laneError = (code, message) => Object.assign(new Error(message), { code });
const unexpected = () =>
  laneError('lane_config_unexpected', 'supabase/config.toml has no project_id, site_url or port line the lanes need.');

/** 0-3 from EZD_LANE (unset or '' is 0); anything else throws lane_invalid. */
export function readLane(env = process.env) {
  const v = env.EZD_LANE;
  if (v === undefined || v === '') return 0;
  if (/^[0-3]$/.test(v)) return Number(v);
  throw laneError('lane_invalid', `EZD_LANE must be 0, 1, 2 or 3 (got "${v}").`);
}

export function laneProjectId(baseId, lane) {
  return lane === 0 ? baseId : `${baseId}-lane${lane}`;
}

/** The CLI's container name `supabase_<service>_<project id of the lane>` (the only place that builds it). */
export function stackContainer(service, baseId, lane) {
  return `supabase_${service}_${laneProjectId(baseId, lane)}`;
}

/** A file name per lane: lane 0 keeps the name, lane n adds -lane<n>. */
export function laneSuffixed(name, lane) {
  return lane === 0 ? name : `${name}-lane${lane}`;
}

export function laneAppPorts(lane) {
  return { web: BASE_WEB_PORT + APP_PORT_STEP * lane, perf: BASE_PERF_PORT + APP_PORT_STEP * lane };
}

export function laneWorkdir(repoRoot, lane) {
  return lane === 0 ? null : path.join(repoRoot, LANES_DIR, `lane${lane}`);
}

const PORT_KEYS = [
  ['api', 'api', 'port'],
  ['db', 'db', 'port'],
  ['shadow', 'db', 'shadow_port'],
  ['pooler', 'db.pooler', 'port'],
  ['studio', 'studio', 'port'],
  ['mail', 'local_smtp', 'port'],
  ['analytics', 'analytics', 'port'],
  ['inspector', 'edge_runtime', 'inspector_port'],
];

/** The eight stack ports of the given (committed) config text, each + 100 x lane. */
export function lanePorts(toml, lane) {
  const found = {};
  let section = '';
  for (const line of toml.split('\n')) {
    const s = /^\[([^\]]+)\]\s*$/.exec(line);
    if (s) {
      section = s[1];
      continue;
    }
    const k = /^(\w+)\s*=\s*(\d+)\s*$/.exec(line);
    if (!k) continue;
    for (const [name, sec, key] of PORT_KEYS) {
      if (section === sec && k[1] === key && !(name in found)) found[name] = Number(k[2]);
    }
  }
  const out = {};
  for (const [name] of PORT_KEYS) {
    if (!(name in found)) throw unexpected();
    out[name] = found[name] + STACK_PORT_STEP * lane;
  }
  return out;
}

/** A lane's config text: project id, stack ports and auth URLs moved; every other line byte-identical. */
export function laneConfigToml(toml, lane) {
  if (!Number.isInteger(lane) || lane < 1 || lane > MAX_LANE) {
    throw laneError('lane_invalid', `EZD_LANE must be 0, 1, 2 or 3 (got "${lane}").`);
  }
  const web = laneAppPorts(lane).web;
  let sawId = false;
  let sawSite = false;
  const out = toml.split('\n').map((line) => {
    const id = /^project_id\s*=\s*"([^"]+)"\s*$/.exec(line);
    if (id) {
      sawId = true;
      return `project_id = "${laneProjectId(id[1], lane)}"`;
    }
    const port = /^(\s*)([a-z_]*port)(\s*=\s*)(\d+)\s*$/.exec(line);
    if (port) return `${port[1]}${port[2]}${port[3]}${Number(port[4]) + STACK_PORT_STEP * lane}`;
    if (/^site_url\s*=\s*"http:\/\/127\.0\.0\.1:3000"\s*$/.test(line)) {
      sawSite = true;
      return line.replace('127.0.0.1:3000', `127.0.0.1:${web}`);
    }
    if (/^additional_redirect_urls\s*=/.test(line)) return line.replace('127.0.0.1:3000', `127.0.0.1:${web}`);
    return line;
  });
  if (!sawId || !sawSite) throw unexpected();
  return out.join('\n');
}

function regularFiles(dir) {
  if (!existsSync(dir)) throw unexpected();
  return readdirSync(dir)
    .filter((f) => statSync(path.join(dir, f)).isFile())
    .sort();
}

function syncFile(dest, bytes) {
  if (existsSync(dest) && Buffer.compare(readFileSync(dest), bytes) === 0) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, dest);
}

function syncDir(destDir, files) {
  mkdirSync(destDir, { recursive: true });
  for (const f of readdirSync(destDir)) {
    const p = path.join(destDir, f);
    if (!files.has(f) && statSync(p).isFile()) unlinkSync(p);
  }
  for (const [name, bytes] of files) syncFile(path.join(destDir, name), bytes);
}

/** Syncs <repo>/.lanes/lane<n>/supabase from the committed supabase/ folder; lane 0 does nothing. */
export function prepareLaneWorkdir(repoRoot, lane) {
  if (lane === 0) return null;
  const src = path.join(repoRoot, 'supabase');
  const configPath = path.join(src, 'config.toml');
  const seedPath = path.join(src, 'seed.sql');
  if (!existsSync(configPath) || !existsSync(seedPath)) throw unexpected();
  const config = laneConfigToml(readFileSync(configPath, 'utf8'), lane);
  const read = (sub) =>
    new Map(regularFiles(path.join(src, sub)).map((f) => [f, readFileSync(path.join(src, sub, f))]));
  const migrations = new Map([...read('migrations')].filter(([f]) => f.endsWith('.sql')));
  const templates = read('templates');
  const dest = laneWorkdir(repoRoot, lane);
  const sup = path.join(dest, 'supabase');
  syncFile(path.join(sup, 'config.toml'), Buffer.from(config));
  syncFile(path.join(sup, 'seed.sql'), readFileSync(seedPath));
  syncDir(path.join(sup, 'migrations'), migrations);
  syncDir(path.join(sup, 'templates'), templates);
  return dest;
}

/** The lane from env, and that SUPABASE_WORKDIR agrees with it. */
export function checkLaneEnv(env, repoRoot) {
  const lane = readLane(env);
  const set = env.SUPABASE_WORKDIR;
  if (lane === 0) {
    if (set) {
      throw laneError(
        'lane_env_mismatch',
        'SUPABASE_WORKDIR is set but EZD_LANE is 0 or unset: unset SUPABASE_WORKDIR.',
      );
    }
    return { lane, workdir: null };
  }
  const workdir = laneWorkdir(repoRoot, lane);
  if (!set || path.resolve(set) !== workdir) {
    throw laneError(
      'lane_env_mismatch',
      `EZD_LANE=${lane} needs SUPABASE_WORKDIR=${workdir} (see node scripts/db/local.mjs lane).`,
    );
  }
  return { lane, workdir };
}

export function laneInfo(repoRoot, lane) {
  const toml = readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
  const id = /^project_id\s*=\s*"([^"]+)"\s*$/m.exec(toml);
  if (!id) throw unexpected();
  const workdir = laneWorkdir(repoRoot, lane);
  return {
    lane,
    projectId: laneProjectId(id[1], lane),
    workdir,
    ...laneAppPorts(lane),
    ports: lanePorts(toml, lane),
    env: lane === 0 ? {} : { EZD_LANE: String(lane), SUPABASE_WORKDIR: workdir },
  };
}
