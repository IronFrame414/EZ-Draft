// The one "is this process alive" check (EZD-1951, audit 2026-11-23 R1). Signal 0 tests for the process without
// touching it; EPERM means it exists but belongs to another user, so it counts as alive. Node built-ins only.
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
