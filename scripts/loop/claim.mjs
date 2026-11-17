#!/usr/bin/env node
// A builder claims a file before editing one that is outside its reserved list (Josh 2026-11-16: parallel lanes never
// edit the same file). Usage, from the ticket worktree:
//   node scripts/loop/claim.mjs <file> [<file> ...]    claim files (paths relative to the repo root)
//   node scripts/loop/claim.mjs --list                 show what every running ticket holds
// Exit 0 = claimed (or already yours). Exit 2 = another ticket holds a file: do not edit it.
// The ticket and the main checkout come from EZD_TICKET and EZD_BUILD_ROOT, which the build loop sets.
import { claimFiles, readClaims } from './lanes.mjs';

const root = process.env.EZD_BUILD_ROOT;
const id = process.env.EZD_TICKET;
const args = process.argv.slice(2);
if (!root || !id) { console.log('claim.mjs runs only inside a build-loop ticket (EZD_BUILD_ROOT and EZD_TICKET unset); nothing to claim.'); process.exit(0); }
if (args[0] === '--list' || !args.length) {
  for (const [t, c] of Object.entries(readClaims(root))) console.log(`${t} (lane ${c.lane}):\n  ${(c.files || []).join('\n  ') || '(none)'}`);
  process.exit(0);
}
const r = claimFiles(root, id, args);
if (r.ok) { console.log(r.added.length ? `claimed for ${id}: ${r.added.join(', ')}` : `already held by ${id}`); process.exit(0); }
if (r.error) { console.log(r.error); process.exit(1); }
console.log(`NOT CLAIMED. Held by another ticket building now: ${r.clashes.map((c) => `${c.file} (${c.holder})`).join(', ')}.`);
console.log('Do not edit these files. If the ticket cannot be finished without them, commit what you have and end with:');
console.log(`BLOCKED: waits for ${[...new Set(r.clashes.map((c) => c.holder))].join(', ')} (file held)`);
process.exit(2);
