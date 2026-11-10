// EZD-364 (vault/plans/EZD-364.md): a gate clears the leftover app server on its lane's ports before the checks.
// A gate stopped mid e2e (the 10-minute background stop, a crash) leaves Playwright's webServer, which runs in its own
// process group, holding the lane's web port as the gate user; the next gate's e2e then fails "is already used".
// Only a server that is exactly the gate user's Next server started in this lane's run tree is signalled (D-Match);
// any other listener fails the gate untouched (D-Foreign). macOS lsof run as the gate user sees only that user's
// processes, so a port lsof calls empty is also bound-tested from Josh's side (portInUse, D-Hidden). exec, sleep and
// portInUse are injected (tests); gate.mjs passes its check spawner, so every command here runs as the gate user.

const LSOF = '/usr/sbin/lsof';
const PS = '/bin/ps';
const KILL = '/bin/kill';
const POLL_MS = 500;
const TERM_POLLS = 20; // 10 s
const KILL_POLLS = 10; // 5 s

export function parseListenPids(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split('\n')) {
    const t = line.trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number(t);
    if (n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

export function isLeftoverGateServer({ user, command, cwd }, { gateUser, runTree }) {
  if (!user || user !== gateUser) return false;
  if (!cwd || !runTree || !(cwd === runTree || cwd.startsWith(`${runTree}/`))) return false;
  const c = String(command ?? '');
  return c.includes('next-server') || /\b(next|pnpm) start -p \d+/.test(c);
}

// D-Find: status 0 = pids; status 1 with no output = none the gate user can see; anything else = could not check.
function listeners(exec, port) {
  const r = exec(LSOF, ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']) ?? {};
  const out = String(r.stdout ?? '');
  const err = String(r.stderr ?? '');
  if (r.status === 0) return { pids: parseListenPids(out) };
  if (r.status === 1 && !out.trim() && !err.trim()) return { pids: [] };
  const first = err.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return { error: `lsof status ${r.status ?? 'none'}${first ? `: ${first}` : ''}` };
}

function describe(exec, pid) {
  const ps = String(exec(PS, ['-o', 'user=,pgid=,command=', '-p', String(pid)])?.stdout ?? '').trim();
  if (!ps) return { pid, gone: true };
  const m = ps.match(/^(\S+)\s+(\d+)\s+(.*)$/);
  const cwdOut = String(exec(LSOF, ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])?.stdout ?? '');
  const cwd = cwdOut.split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? '';
  return m ? { pid, user: m[1], pgid: Number(m[2]), command: m[3], cwd } : { pid, user: '', pgid: 0, command: ps, cwd };
}

async function isFree(exec, port, portInUse) {
  const l = listeners(exec, port);
  if (l.error || l.pids.length) return false;
  return !(portInUse && (await portInUse(port)));
}

async function waitFree(exec, port, polls, sleep, portInUse) {
  for (let i = 0; i < polls; i++) {
    await sleep(POLL_MS);
    if (await isFree(exec, port, portInUse)) return true;
  }
  return false;
}

export async function freeLanePorts({ ports, exec, gateUser, runTree, sleep, portInUse }) {
  const lines = [];
  let ok = true;
  const fail = (line) => { ok = false; lines.push(line); };
  for (const port of ports) {
    let l = listeners(exec, port);
    if (l.error) { fail(`port ${port}: could not check (${l.error})`); continue; }
    let procs = l.pids.map((pid) => describe(exec, pid));
    // D-Gone: a listener that exited between lsof and ps; ask lsof once more and judge the port on that answer.
    if (procs.some((p) => p.gone)) {
      l = listeners(exec, port);
      if (l.error) { fail(`port ${port}: could not check (${l.error})`); continue; }
      procs = l.pids.map((pid) => describe(exec, pid)).map((p) => (p.gone ? { pid: p.pid, user: '', pgid: 0, command: 'exited while checked', cwd: '' } : p));
    }
    if (!procs.length) {
      if (portInUse && (await portInUse(port))) fail(`port ${port}: held by a process the gate user cannot see; stop it and run the gate again`);
      else lines.push(`port ${port}: free`);
      continue;
    }
    // pgid 0 or 1 is never signalled: kill -1 would reach every process the gate user owns.
    const foreign = procs.find((p) => !(p.pgid > 1 && isLeftoverGateServer(p, { gateUser, runTree })));
    if (foreign) {
      fail(`port ${port}: held by pid ${foreign.pid} (${foreign.user || 'unknown'}, ${foreign.command}), not a leftover gate server; stop it and run the gate again`);
      continue;
    }
    const groups = [...new Set(procs.map((p) => p.pgid))];
    for (const pgid of groups) exec(KILL, ['-TERM', `-${pgid}`]);
    let freed = await waitFree(exec, port, TERM_POLLS, sleep, portInUse);
    if (!freed) {
      for (const pgid of groups) exec(KILL, ['-KILL', `-${pgid}`]);
      freed = await waitFree(exec, port, KILL_POLLS, sleep, portInUse);
    }
    const who = procs.map((p) => `pid ${p.pid} (group ${p.pgid})`).join(', ');
    if (freed) lines.push(`port ${port}: stopped leftover gate server ${who}`);
    else fail(`port ${port}: leftover gate server ${who} still holds the port after TERM and KILL`);
  }
  return { ok, lines };
}
