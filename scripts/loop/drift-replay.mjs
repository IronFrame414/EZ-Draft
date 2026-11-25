// Replays the loop's DRIFT lines (EZD-1942, AC-2): how many of the test files a ticket changed outside its claim would
// have been in the claim with this ticket's two changes:
//   - import: the test existed on develop when the footprint was predicted and imports a file the footprint named
//     (the import scan the footprint step now runs, scripts/loop/import-graph.mjs);
//   - new: the test was new at the merge and the footprint held a `<new>` placeholder for its folder (drift() now
//     counts such a file as claimed, scripts/loop/lanes.mjs).
//
//   node scripts/loop/drift-replay.mjs --extract <loop.log> <transcripts dir> [<dir> ...] [--limit 90] > fixture.json
//     Builds the fixture from the real history: for each DRIFT line the ticket, the time, the files the line lists
//     (the loop prints the first 8), the footprint the ticket held (its last footprint answer before the line, from the
//     footprint sessions' transcripts), and for each listed test file whether develop had it at the footprint and at
//     the DRIFT line. The import scan runs on develop as it was at the footprint (git archive into a temporary folder);
//     for each footprint file the fixture keeps how many tests imported it then and which of the listed tests did.
//     A (ticket, file) pair listed twice counts once.
//   node scripts/loop/drift-replay.mjs [fixture.json]
//     Replays the fixture with the real matching code and prints the shares.
// Node built-ins plus git and tar.
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drift, parseFootprint } from './lanes.mjs';
import { buildTestImportGraph, isTest, MAX_PER_FILE, testsFor } from './import-graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE = path.join(ROOT, 'scripts/loop/__tests__/fixtures/drift-replay.json');

// `[ts] DRIFT EZD-1: changed N file(s) outside its claim: a, b, c`
export function parseDriftLines(log) {
  const out = [];
  for (const line of String(log).split('\n')) {
    const m = line.match(/^\[([^\]]+)\] DRIFT (EZD-\d+): changed (\d+) file\(s\) outside its claim: (.*)$/);
    if (m) out.push({ ticket: m[2], ts: m[1], changed: Number(m[3]), drifted: m[4].split(', ').map((x) => x.trim()).filter(Boolean) });
  }
  return out;
}

// Footprint answers from footprint sessions' transcripts (titled "EZD-n footprint"): [{ ticket, ts, files }].
export function readFootprintSessions(dirs) {
  const out = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      const head = Buffer.alloc(200);
      const fd = openSync(file, 'r');
      try { readSync(fd, head, 0, 200, 0); } finally { closeSync(fd); }
      const ticket = (head.toString('utf8').match(/"customTitle":"(EZD-\d+) footprint"/) || [])[1];
      if (!ticket) continue;
      let ts = null; const texts = [];
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.timestamp) ts = o.timestamp;
        if (o.type === 'assistant') for (const c of o.message?.content || []) if (c.type === 'text') texts.push(c.text);
      }
      const fp = parseFootprint(texts.join('\n'));
      if (fp && ts) out.push({ ticket, ts, files: fp.files });
    }
  }
  return out;
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const developAt = (ts) => git(['rev-list', '-1', `--before=${ts}`, 'develop']);
const has = (sha, f) => { try { execFileSync('git', ['cat-file', '-e', `${sha}:${f}`], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };

// The import scan as it would have run on develop at `sha`.
const graphs = new Map();
function graphAt(sha) {
  if (graphs.has(sha)) return graphs.get(sha);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'drift-replay-'));
  try {
    execFileSync('sh', ['-c', `git archive ${sha} app packages scripts | tar -x -C "${tmp}"`], { cwd: ROOT });
    const g = buildTestImportGraph(tmp);
    graphs.set(sha, g);
    return g;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export function extract(log, sessions, limit = 90) {
  const rows = [];
  const seen = new Set();
  for (const d of parseDriftLines(log).slice(0, limit)) {
    const t = Date.parse(d.ts);
    const before = sessions.filter((x) => x.ticket === d.ticket && Date.parse(x.ts) <= t).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const fp = before.length ? before[before.length - 1] : null;
    const atDrift = developAt(d.ts);
    const atFp = fp ? developAt(fp.ts) : null;
    const tests = [];
    for (const f of d.drifted.filter(isTest)) {
      if (seen.has(`${d.ticket} ${f}`)) continue;
      seen.add(`${d.ticket} ${f}`);
      tests.push({ file: f, at_footprint: atFp ? has(atFp, f) : null, at_drift: has(atDrift, f) });
    }
    let importers = null;
    if (fp) {
      const g = graphAt(atFp);
      const listed = new Set(tests.map((x) => x.file));
      importers = {};
      for (const f of fp.files) {
        const all = g.importers.get(f);
        if (all) importers[f] = { count: all.size, listed: [...all].filter((x) => listed.has(x)).sort() };
      }
    }
    rows.push({ ticket: d.ticket, ts: d.ts, footprint_ts: fp?.ts || null, footprint: fp?.files || null, tests, importers });
  }
  return rows;
}

// The import graph of a row, rebuilt from the fixture: each footprint file's importers are the listed tests that
// imported it plus stand-ins for the others, so the hub limit sees the real count.
function rowGraph(row) {
  const importers = new Map();
  for (const [f, { count, listed }] of Object.entries(row.importers || {})) {
    const set = new Set(listed);
    for (let i = 0; set.size < count; i++) set.add(`<other test ${i}>`);
    importers.set(f, set);
  }
  return { importers };
}

// Replays rows with the loop's own code: testsFor() for the import scan, drift() for the placeholder rule.
export function replay(rows, { maxPerFile = MAX_PER_FILE } = {}) {
  const r = { lines: rows.length, total: 0, byImport: 0, byPlaceholder: 0, noFootprint: 0, newTests: 0 };
  for (const row of rows) {
    r.total += row.tests.length;
    if (!row.footprint) { r.noFootprint += row.tests.length; continue; }
    const { added } = testsFor(rowGraph(row), row.footprint, { maxPerFile });
    const claim = [...row.footprint, ...added];
    const newFiles = row.tests.filter((x) => !x.at_drift).map((x) => x.file);
    r.newTests += newFiles.length;
    const left = new Set(drift(row.tests.map((x) => x.file), { [row.ticket]: { files: claim } }, row.ticket, new Set(), newFiles).unclaimed);
    for (const x of row.tests) {
      if (left.has(x.file)) continue;
      if (x.at_footprint && added.includes(x.file)) r.byImport++;
      else r.byPlaceholder++;
    }
  }
  r.covered = r.byImport + r.byPlaceholder;
  r.share = r.total ? r.covered / r.total : 0;
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--extract') {
    const li = a.indexOf('--limit');
    const dirs = a.slice(2).filter((x, i, all) => x !== '--limit' && all[i - 1] !== '--limit');
    const rows = extract(readFileSync(a[1], 'utf8'), readFootprintSessions(dirs), li >= 0 ? Number(a[li + 1]) : 90);
    process.stdout.write(JSON.stringify(rows) + '\n');
  } else {
    const r = replay(JSON.parse(readFileSync(a[0] || FIXTURE, 'utf8')));
    console.log(`${r.lines} DRIFT lines, ${r.total} drifted test files: ${r.covered} would have been claimed (${Math.round(r.share * 100)}%): ${r.byImport} by the import scan, ${r.byPlaceholder} new files under a <new> placeholder; ${r.noFootprint} from tickets whose footprint was not found; ${r.newTests} new test files in all`);
  }
}
