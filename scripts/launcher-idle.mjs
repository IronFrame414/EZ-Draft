// What the launcher does when it cannot start a unit right now (Q-0233, Josh 2026-10-20): it never stops unless it hits a
// usage limit or truly nothing can be done until Josh answers, and even then it waits and re-checks so his answer is picked
// up without a restart. STOP (fix mode, PROCESS.md rule 19) pauses it until the file is removed. Only a budget hold ends it.
// --once and --dry-run keep exiting at once.
export const STOP_POLL_MS = 60_000;
export const NONE_POLL_MS = 5 * 60_000;

export function idleAction({ stopExists, next, once = false }) {
  const none = /^none:/.test(next);
  if (once && (stopExists || none)) return { action: 'stop' };
  if (stopExists) return { action: 'wait', ms: STOP_POLL_MS, why: 'vault/handoff/STOP exists (fix mode); waiting for it to be removed', notify: null };
  if (!none) return { action: 'run' };
  const reason = next.replace(/^none:\s*/, '');
  if (/budget hold/.test(reason)) return { action: 'stop' };
  return { action: 'wait', ms: NONE_POLL_MS, why: `nothing to run: ${reason}; re-checking every 5 minutes`, notify: `launcher waiting: ${reason}` };
}
