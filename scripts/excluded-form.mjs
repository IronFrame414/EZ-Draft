// The command a unit reruns after a sandbox stop (EZD-317, Q-0541, Q-0542). The unit sandbox lets only the absolute
// excludedCommands of scripts/unit-sandbox.json out of the sandbox, so a STOP text names that exact form, read from the
// script's own checkout: a worktree copy has the same entries, so its rerun goes to the main checkout's write-denied script.
// Never throws: the gate loads this file (a repair hard limit, scripts/launcher-idle.mjs REPAIR_NEVER_FILES).
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function excludedPrefix(scriptsDir, tail) {
  const fallback = `node scripts/${tail}`;
  try {
    const entries = JSON.parse(readFileSync(path.join(scriptsDir, 'unit-sandbox.json'), 'utf8'))?.sandbox?.excludedCommands;
    if (!Array.isArray(entries)) return fallback;
    const hit = entries.find((e) => typeof e === 'string' && e.startsWith('node /') && e.endsWith(`/scripts/${tail} *`));
    return hit ? hit.slice(0, -2) : fallback;
  } catch {
    return fallback;
  }
}
