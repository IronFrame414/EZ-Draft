// EZD-1959 (audit 2026-11-23 O7, area 7 finding 11): helpers for `pnpm db:base` (node scripts/db/local.mjs base), which
// brings the lane-0 stack (port 54321) to the newest migration with a matching gate secret, for live UI checks.
// The build lanes use 1-4, so lane 0 goes stale; a lane-0 gate (scripts/check.mjs with EZD_LANE unset or 0) or a lane-0
// `db:up` resets it too, so `base` refuses while one runs. There is no lane-0 lock to read: a running gate is found in
// the process list, its lane in its environment (`ps -E`, same-user processes). Node built-ins only.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

export const API_GATE_HEADER = 'x-ezd-api-gate';

/** `base` is lane 0 only: the caller's lane settings are dropped before any CLI, SQL or Docker call. */
export function forceLaneZero(env) {
  delete env.EZD_LANE;
  delete env.SUPABASE_WORKDIR;
  return env;
}

// A process that holds or resets the lane-0 stack: `node <path>scripts/check.mjs` (the gate) or
// `node <path>scripts/db/local.mjs up|base`. Only the program and its first arguments count, so a shell or a prompt
// that merely mentions the path does not.
export function isHolderCommand(command) {
  const [bin = '', script = '', sub = ''] = String(command).trim().split(/\s+/);
  if (!/(^|\/)node$/.test(bin)) return false;
  if (/(^|\/)scripts\/check\.mjs$/.test(script)) return true;
  return /(^|\/)scripts\/db\/local\.mjs$/.test(script) && (sub === 'up' || sub === 'base');
}

/** Lane of a process from its `ps -E` line (the environment comes last): EZD_LANE=1-4 is that lane; unset, empty or 0 is lane 0. */
export function laneOfLine(line) {
  const all = [...String(line).matchAll(/(?:^|\s)EZD_LANE=(\S*)/g)];
  const v = all.length ? all.at(-1)[1] : '';
  return /^[1-4]$/.test(v) ? Number(v) : 0;
}

/** Lane-0 holders in `ps -A -ww -E -o pid=,command=` output, other than the pids in `skip`: [{ pid, command }]. */
export function holdersFromPs(text, { skip = [], alive }) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(raw);
    if (!m) continue;
    const pid = Number(m[1]);
    const rest = m[2];
    if (skip.includes(pid) || !isHolderCommand(rest) || laneOfLine(rest) !== 0 || !alive(pid)) continue;
    out.push({ pid, command: rest.split(/\s+/).slice(0, 4).join(' ') });
  }
  return out;
}

/** The running lane-0 holders. A process list that cannot be read counts as a holder (refuse, never guess). */
// pid.mjs is loaded here, not at the top, so local.mjs's other commands load without scripts/loop.
export async function laneZeroHolders({ ps = runPs, skip = [process.pid, process.ppid] } = {}) {
  const { pidAlive } = await import('../loop/pid.mjs');
  const r = ps(['-A', '-ww', '-E', '-o', 'pid=,command=']);
  if (!r.ok) return [{ pid: 0, command: `ps failed: ${r.out.trim().slice(0, 200)}` }];
  return holdersFromPs(r.stdout, { skip, alive: pidAlive });
}

function runPs(args) {
  const r = spawnSync('ps', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0 && !r.error, stdout: r.stdout || '', out: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error.message) : '') };
}

export function refusalText(holders) {
  const lines = holders.map((h) => (h.pid ? `  pid ${h.pid}: ${h.command}` : `  ${h.command}`));
  return ['A lane-0 gate or database reset holds the base stack (port 54321); pnpm db:base did not run. Try again when it ends:', ...lines].join('\n');
}

/** The 14-digit version of the newest `supabase/migrations/<version>_<name>.sql`. */
export function newestMigrationFile(dir) {
  const versions = readdirSync(dir).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).map((f) => f.slice(0, 14)).sort();
  if (!versions.length) throw new Error(`no migration files in ${dir}`);
  return versions.at(-1);
}

/** Calls rpc/sign_in_throttle_take with the gate header. ok unless the call fails or the gate refuses it (42501 api_gate). */
export async function probeGatedRpc({ apiUrl, apiKey, secret, fetchImpl = globalThis.fetch }) {
  const url = `${String(apiUrl).replace(/\/$/, '')}/rest/v1/rpc/sign_in_throttle_take`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { apikey: apiKey, [API_GATE_HEADER]: secret, 'content-type': 'application/json' },
      body: JSON.stringify({ p_kind: 'link', p_email_key: null, p_ip_key: null }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    return { ok: false, detail: `request failed: ${error.message}` };
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const code = body && typeof body === 'object' && !Array.isArray(body) ? body.code : undefined;
  if (code === '42501') return { ok: false, detail: `HTTP ${res.status} 42501 ${body.message ?? ''}`.trim() };
  if (!res.ok || !Array.isArray(body)) return { ok: false, detail: `HTTP ${res.status} ${code ?? ''}`.trim() };
  return { ok: true, detail: `HTTP ${res.status}, allowed ${String(body[0]?.allowed)}` };
}
