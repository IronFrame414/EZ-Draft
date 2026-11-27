// Build lanes (Josh 2026-11-16): several tickets build at once, each on its own database lane. No two running tickets
// may edit the same file. Every running ticket holds a claim: the files it predicted it would change (its footprint) and
// any file it claimed later with scripts/loop/claim.mjs. A ticket starts only when its footprint is free, and a builder
// that needs a file another lane holds stops and waits for it. Node built-ins only.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_LANE } from '../db/lane.mjs';

// config `lanes`: the database lanes to build on (0..MAX_LANE, scripts/db/lane.mjs; EZD-2001 made it 4), or a count n
// meaning lanes 0..n-1 (at most MAX_LANE + 1). Unknown and repeated lanes are dropped; the list is sorted.
export function configLanes(c = {}) {
  const v = c.lanes ?? [0];
  const list = Array.isArray(v)
    ? v.map(Number)
    : Array.from({ length: Math.max(1, Math.min(MAX_LANE + 1, Number(v) || 1)) }, (_, i) => i);
  return [...new Set(list.filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LANE))].sort((a, b) => a - b);
}

// Files no two lanes may share even though no footprint names them: they follow from other changes.
// A migration regenerates the database types; a dependency change touches the lockfile and the architecture list.
export function impliedFiles(files, shared = SHARED_OK) {
  const out = new Set(files.map(normalize).filter(Boolean));
  for (const f of [...out]) {
    if (f.startsWith('supabase/migrations/')) out.add('app/src/server/db/database.types.ts');
    if (f === 'package.json' || /(^|\/)package\.json$/.test(f)) { out.add('pnpm-lock.yaml'); out.add('docs/architecture.md'); }
  }
  for (const f of shared) out.delete(f);
  return [...out].sort();
}

// Files every builder appends to; git merges them with the union driver (.gitattributes), so they never clash.
// EZD-1953: assumptions.md is now a generated index (vault/tools/assumptions-index.mjs) and builders record in their
// own ticket file instead; it stays here, with its union merge, so a branch cut before the split still merges.
export const SHARED_OK = new Set(['vault/build/assumptions.md']);
// EZD-1953 (audit 2026-11-23 B6): each ticket records its assumptions in its own file, which no other lane writes, so
// it needs no claim and is never drift.
export const ownAssumptions = (id) => `vault/build/assumptions/${id}.md`;
// Plus the files Josh allows two lanes to edit at once (config `shared_files`: the message catalogs, and since EZD-1941
// docs/architecture.md and the generated database types, which the loop regenerates after the merge, never hand-merged). Two lanes may change such a file; the
// second to finish takes in develop, resolves any conflict and passes the full check again before it merges.
export function sharedSet(root) {
  let extra = [];
  try { extra = JSON.parse(readFileSync(path.join(root, 'vault/build/config.json'), 'utf8')).shared_files || []; } catch {}
  return new Set([...SHARED_OK, ...extra.map(normalize).filter(Boolean)]);
}

// EZD-1941 (audit 2026-11-23 W2): a ticket claims the single migration file it adds, never the whole folder. Two
// tickets adding different migrations run at once; at the merge the loop renames a branch's migration that sorts at or
// before develop's newest so it applies after it (scripts/loop/merge-files.mjs).
export const MIGRATIONS = 'supabase/migrations/';

export function normalize(f) {
  let s = String(f || '').trim().replace(/^["'`]+|["'`,;:]+$/g, '').replace(/\\/g, '/').replace(/^\.\//, '');
  s = s.replace(/:\d+(-\d+)?$/, '');
  if (!s || s.startsWith('/') || s.includes('..') || /\s/.test(s)) return '';
  return s;
}

// The files of `mine` that another holder already holds: [{ file, holder }].
export function overlaps(mine, claims, self, shared = SHARED_OK) {
  const held = new Map();
  for (const [id, c] of Object.entries(claims || {})) {
    if (id === self) continue;
    for (const f of c.files || []) held.set(f, id);
  }
  const out = [];
  const seen = new Set();
  for (const f of impliedFiles(mine, shared)) {
    // A placeholder for a file not named yet (`folder/<new>`) is a new file: two of them in one folder are different
    // files. That holds for a new migration too (EZD-1941).
    if (f.includes('<new>')) continue;
    if (held.has(f) && !seen.has(f)) { seen.add(f); out.push({ file: f, holder: held.get(f) }); }
  }
  return out;
}

// Which candidates start now in `free` lanes, in candidate order. A candidate whose footprint overlaps a running
// ticket or one chosen earlier in this pass is skipped with the reason; it does not hold the lane.
export function schedule({ candidates, footprints, claims, free, shared = SHARED_OK }) {
  const taken = { ...claims };
  const start = [];
  const waiting = [];
  for (const t of candidates) {
    if (start.length >= free) break;
    const fp = footprints[t.id];
    if (!fp) { waiting.push({ id: t.id, reason: 'no footprint yet' }); continue; }
    const o = overlaps(fp.files, taken, t.id, shared);
    if (o.length) { waiting.push({ id: t.id, reason: `needs ${o.map((x) => `${x.file} (${x.holder})`).slice(0, 4).join(', ')}` }); continue; }
    start.push(t);
    taken[t.id] = { files: impliedFiles(fp.files, shared) };
  }
  return { start, waiting };
}

// Whether a placeholder for a new file (`folder/<new>`, `folder/<new>.spec.ts`) names the new file `f`: same folder
// (not a subfolder), and `f` ends with whatever follows `<new>`.
export function placeholderCovers(placeholder, f) {
  const i = placeholder.indexOf('<new>');
  if (i < 0) return false;
  const dir = placeholder.slice(0, i);
  const suffix = placeholder.slice(i + 5);
  if (!dir.endsWith('/') || !f.startsWith(dir)) return false;
  const rest = f.slice(dir.length);
  return !rest.includes('/') && rest.length > suffix.length && rest.endsWith(suffix);
}

// Files changed on a branch that it never claimed, and which of those another running ticket holds. A file the branch
// added (`added`, from `git diff --diff-filter=A`) is claimed when the claim holds a `<new>` placeholder for its
// folder: the footprint named the new file the only way it could, and no other lane can be editing a file develop
// does not have unless it named the same new path, which is still a clash (EZD-1942).
export function drift(changed, claims, self, shared = SHARED_OK, added = []) {
  const files = claims?.[self]?.files || [];
  const mine = new Set([...files, ownAssumptions(self)]);
  const placeholders = files.filter((f) => f.includes('<new>'));
  const isNew = new Set(added.map(normalize));
  const covered = (f) => isNew.has(f) && placeholders.some((p) => placeholderCovers(p, f));
  const outside = changed.map(normalize).filter((f) => f && !shared.has(f) && !mine.has(f));
  // `placed`: new files a placeholder covers. They are no DRIFT, but another lane may have named the same new path, so
  // they are still checked for clashes, and the loop adds them to the claim by name before the merge.
  const placed = outside.filter(covered);
  const unclaimed = outside.filter((f) => !covered(f));
  return { unclaimed, placed, clashes: overlaps([...unclaimed, ...placed], claims, self, shared) };
}

// Parses the footprint answer: the last JSON object with a "files" array.
export function parseFootprint(text) {
  const s = String(text || '');
  for (let i = s.lastIndexOf('{"files"'); i >= 0; i = s.lastIndexOf('{"files"', i - 1)) {
    const end = s.indexOf('}', s.indexOf(']', i));
    try {
      const o = JSON.parse(s.slice(i, end + 1));
      if (Array.isArray(o.files)) return { files: impliedFiles(o.files, new Set()), notes: String(o.notes || '').slice(0, 300) };
    } catch {}
    if (i === 0) break;
  }
  return null;
}

// ---------- the claims file, shared by the loop and claim.mjs ----------
// vault/build/claims.json: { "<ticket>": { lane, files: [..] } }. Every read-change-write runs under a lock
// directory, so a builder's claim and the loop's start of another ticket cannot both take the same file.
export const claimsPath = (root) => path.join(root, 'vault/build/claims.json');
const lockDir = (root) => path.join(root, 'vault/build/.claims.lock');

export function withClaims(root, fn, { waitMs = 15000 } = {}) {
  const lock = lockDir(root);
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // A lock older than a minute is left by a crashed holder.
      try { if (Date.now() - statSync(lock).mtimeMs > 60000) { rmSync(lock, { recursive: true, force: true }); continue; } } catch {}
      if (Date.now() - t0 > waitMs) throw new Error('claims lock busy');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const f = claimsPath(root);
    let claims = {};
    try { claims = JSON.parse(readFileSync(f, 'utf8')); } catch {}
    const before = JSON.stringify(claims);
    const res = fn(claims);
    if (JSON.stringify(claims) !== before) {
      const tmp = `${f}.tmp-${process.pid}`;
      writeFileSync(tmp, JSON.stringify(claims, null, 2) + '\n');
      renameSync(tmp, f);
    }
    return res;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export const readClaims = (root) => { try { return JSON.parse(readFileSync(claimsPath(root), 'utf8')); } catch { return {}; } };

// Adds files to a ticket's claim if no other ticket holds them. Returns { ok, added, clashes }.
export function claimFiles(root, id, files) {
  return withClaims(root, (claims) => {
    if (!claims[id]) return { ok: false, added: [], clashes: [], error: `${id} is not building` };
    const shared = sharedSet(root);
    const clashes = overlaps(files, claims, id, shared);
    if (clashes.length) return { ok: false, added: [], clashes };
    const have = new Set(claims[id].files);
    const added = impliedFiles(files, shared).filter((f) => !have.has(f));
    claims[id].files = [...have, ...added].sort();
    return { ok: true, added, clashes: [] };
  });
}

export function existsIn(root, f) { return existsSync(path.join(root, f)); }
