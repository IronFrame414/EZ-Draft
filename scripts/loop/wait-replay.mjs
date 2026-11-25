#!/usr/bin/env node
// EZD-1941 (audit 2026-11-23 W2): replays the loop's "lanes free: N; next tickets wait on held files: ..." lines with
// the current lane rules (scripts/loop/lanes.mjs and the repo's shared files) and reports which waits would still
// happen. The log names the whole migrations folder (`supabase/migrations/`) as the old rule held it; the replay
// stands in a different new migration on each side, which is what two tickets adding migrations hold.
//   node scripts/loop/wait-replay.mjs [<loop.log>]    default: $EZD_BUILD_ROOT/vault/build/loop.log
// A logged reason names at most 4 files per ticket (scripts/loop/lanes.mjs schedule), so the replay judges those.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { overlaps, sharedSet } from './lanes.mjs';

const MIGRATIONS = 'supabase/migrations/';

// [{ ts, waits: [{ id, needs: [{ file, holder }] }] }] from the "lanes free" lines of a loop log.
export function parseWaitLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = /^\[([^\]]+)\] lanes free: \d+; next tickets wait on held files: (.*)$/.exec(line);
    if (!m) continue;
    const waits = [];
    for (const seg of m[2].split('; ')) {
      const w = /^(\S+) needs (.*)$/.exec(seg);
      if (!w) continue;
      const needs = [];
      for (const part of w[2].split(', ')) {
        const f = /^(.*) \(([^()\s]+)\)$/.exec(part);
        if (f) needs.push({ file: f[1], holder: f[2] });
      }
      waits.push({ id: w[1], needs });
    }
    out.push({ ts: m[1], waits });
  }
  return out;
}

// Whether `file`, which `holder` held when `id` waited, still blocks `id` under the current rules.
export function stillBlocks({ id, file, holder }, shared) {
  const mine = file === MIGRATIONS ? `${MIGRATIONS}20990101000000_${id}.sql` : file;
  const theirs = file === MIGRATIONS ? `${MIGRATIONS}20990101000001_${holder}.sql` : file;
  return overlaps([mine], { [holder]: { files: [theirs] } }, id, shared).length > 0;
}

// Each logged wait with the files that still block it under the current rules.
export function replay(lines, shared) {
  return lines.flatMap((l) => l.waits.map((w) => ({
    ts: l.ts, id: w.id, needs: w.needs,
    still: w.needs.filter((n) => stillBlocks({ id: w.id, ...n }, shared)),
  })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const file = process.argv[2] || path.join(process.env.EZD_BUILD_ROOT || root, 'vault/build/loop.log');
  const lines = parseWaitLines(readFileSync(file, 'utf8'));
  const r = replay(lines, sharedSet(root));
  const gone = r.filter((w) => w.needs.length && !w.still.length);
  console.log(`${lines.length} "lanes free" lines, ${r.length} waits; ${gone.length} would not happen now, ${r.length - gone.length} still would.`);
}
