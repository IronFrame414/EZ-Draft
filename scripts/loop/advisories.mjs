// Security advisories (Josh 2026-11-19: "security should be addressed as this is built"). Two Next.js advisories were
// published on Nov 16 and 17; nothing looked at them until Nov 19, when `next build` began refusing the vulnerable
// version and every lane's gate went red for hours. The loop now runs `pnpm audit --prod` every few hours and turns
// every advisory it has not seen into one top-of-line fix ticket (track "security": never held by the phase gate and
// never holding it), so a patch lands the day it is published instead of after builds break. The audit is never part
// of the gate: a new advisory must not turn every lane red. Node built-ins only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SEEN_FILE = 'vault/build/advisories.json';
export const TRACK = 'security';
const SEV = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

// `pnpm audit --json` output -> one row per advisory that has a fix.
export function parseAudit(text) {
  let j;
  try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  if (!j || typeof j !== 'object' || !('advisories' in j)) return null;
  return Object.values(j.advisories || {})
    .map((a) => ({
      id: a.github_advisory_id || `npm-${a.id}`,
      module: a.module_name,
      severity: a.severity,
      title: String(a.title || '').trim(),
      vulnerable: a.vulnerable_versions,
      patched: a.patched_versions,
      found: [...new Set((a.findings || []).map((f) => f.version))],
      url: a.url || '',
    }))
    .filter((a) => a.module && a.patched && a.patched !== '<0.0.0')
    .sort((a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9) || a.module.localeCompare(b.module) || a.id.localeCompare(b.id));
}

export function unseen(list, seen) {
  return list.filter((a) => !seen?.[a.id]);
}

// Next free fix-ticket id: EZD-4xx above the highest one in use (fix tickets EZD-420 to EZD-424 live there).
export function nextFixId(ids) {
  let max = 424;
  for (const id of ids) { const m = /^EZD-(4\d\d)$/.exec(id); if (m) max = Math.max(max, Number(m[1])); }
  if (max >= 499) throw new Error('no free EZD-4xx id for a security fix ticket');
  return `EZD-${max + 1}`;
}

// The ticket record and its acceptance-criteria rows for one batch of advisories.
export function fixTicket(id, advisories, today) {
  const mods = [...new Set(advisories.map((a) => a.module))];
  const title = `Fix: security advisories in ${mods.join(', ')}; move to the patched versions`.slice(0, 140);
  const list = advisories.map((a) => `${a.id} ${a.severity} ${a.module} ${a.vulnerable} -> ${a.patched} (installed ${a.found.join(', ') || '?'}): ${a.title}`);
  const T = `${id} ${title}`;
  const ac = [
    `| AC-${id}-1 | ${T} | \`pnpm audit --prod\` no longer lists ${advisories.map((a) => a.id).join(', ')}. Each package moves to a patched version: a direct dependency by its version in package.json, a package that only comes in through another one by a pnpm override in the root package.json when no patched parent release exists. |`,
    `| AC-${id}-2 | ${T} | The full gate (\`node scripts/check.mjs\`) passes, and no test is changed to make it pass; a change a new version forces in our code keeps behaviour the same. |`,
    `| AC-${id}-3 | ${T} | docs/architecture.md Dependencies shows the new version of every direct dependency changed, and lists each override with the advisory it answers. |`,
  ];
  return {
    ticket: {
      id, phase: 1, track: TRACK, title,
      depends_raw: '',
      spec_ref: `Security advisories found by the build loop's pnpm audit on ${today}: ${list.join(' | ')}`.slice(0, 2000),
      spec_files: ['spec/sections/11-non-functional-requirements.md'],
      decisions: [], mockups: [], priority: 1,
      phase_file: 'tickets/phases/phase-02.md',
      depends_on: [],
      acs: ac.map((_, i) => `AC-${id}-${i + 1}`),
      acs_source: `loop-advisories-${today}`,
    },
    acRows: ac,
  };
}

export function runAudit(root) {
  const r = spawnSync('pnpm', ['audit', '--prod', '--json'], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  // pnpm audit exits 1 when it finds anything; only unparseable output is a failure.
  const list = parseAudit(r.stdout || '');
  return list ? { ok: true, list } : { ok: false, error: (r.stderr || r.error?.message || 'no audit output').slice(0, 300) };
}

export function readSeen(root) {
  const f = path.join(root, SEEN_FILE);
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')).seen || {}; } catch { return {}; }
}

// Writes the ticket, its ACs and the seen list. Returns the files changed, for one pathspec commit by the caller.
export function recordFixTicket(root, advisories, today, { ticketsFile = 'vault/tickets/tickets.json', acFile = 'vault/spec/acceptance-criteria.md' } = {}) {
  const tf = path.join(root, ticketsFile);
  const raw = readFileSync(tf, 'utf8');
  const j = JSON.parse(raw);
  const list = Array.isArray(j) ? j : j.tickets;
  const id = nextFixId(list.map((t) => t.id));
  const { ticket, acRows } = fixTicket(id, advisories, today);
  list.push(ticket);
  if (!Array.isArray(j) && typeof j.count === 'number') j.count += 1;
  const indent = (raw.match(/^[\[{]\n( +)/) || [])[1]?.length || 2;
  writeFileSync(tf, JSON.stringify(j, null, indent) + '\n');
  const af = path.join(root, acFile);
  const acText = readFileSync(af, 'utf8');
  writeFileSync(af, acText.replace(/\n*$/, '\n') + acRows.join('\n') + '\n');
  const sf = path.join(root, SEEN_FILE);
  const seenDoc = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : { _readme: README, seen: {} };
  for (const a of advisories) seenDoc.seen[a.id] = { ticket: id, module: a.module, severity: a.severity, since: today };
  writeFileSync(sf, JSON.stringify(seenDoc, null, 2) + '\n');
  return { id, title: ticket.title, files: [ticketsFile, acFile, SEEN_FILE] };
}

export const README = 'Security advisories the build loop has turned into fix tickets (scripts/loop/advisories.mjs). An advisory listed here never makes another ticket. Delete an entry to have the next audit ticket it again.';
