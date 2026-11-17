// Build lanes (Josh 2026-11-16): several tickets build at once, each on its own database lane. No two running tickets
// may edit the same file. Every running ticket holds a claim: the files it predicted it would change (its footprint) and
// any file it claimed later with scripts/loop/claim.mjs. A ticket starts only when its footprint is free, and a builder
// that needs a file another lane holds stops and waits for it. Node built-ins only.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
export const SHARED_OK = new Set(['vault/build/assumptions.md']);
// Plus the files Josh allows two lanes to edit at once (config `shared_files`). Two lanes may change such a file; the
// second to finish takes in develop, resolves any conflict and passes the full check again before it merges.
export function sharedSet(root) {
  let extra = [];
  try { extra = JSON.parse(readFileSync(path.join(root, 'vault/build/config.json'), 'utf8')).shared_files || []; } catch {}
  return new Set([...SHARED_OK, ...extra.map(normalize).filter(Boolean)]);
}

// Two migrations made in parallel can both sort "after develop's newest" and then apply in the wrong order, so the
// migrations folder is held as a whole: one lane at a time adds a migration.
export const MIGRATIONS = 'supabase/migrations/';
const key = (f) => (f.startsWith(MIGRATIONS) ? MIGRATIONS : f);

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
    for (const f of c.files || []) held.set(key(f), id);
  }
  const out = [];
  const seen = new Set();
  for (const f of impliedFiles(mine, shared)) {
    // A placeholder for a file not named yet (`folder/<new>`) is a new file: two of them in one folder are different
    // files. A new migration still holds the migrations folder (key()).
    if (f.includes('<new>') && !f.startsWith(MIGRATIONS)) continue;
    const k = key(f);
    if (held.has(k) && !seen.has(k)) { seen.add(k); out.push({ file: k === MIGRATIONS ? MIGRATIONS : f, holder: held.get(k) }); }
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

// Files changed on a branch that it never claimed, and which of those another running ticket holds.
export function drift(changed, claims, self, shared = SHARED_OK) {
  const mine = new Set((claims?.[self]?.files || []).map(key));
  const unclaimed = changed.map(normalize).filter((f) => f && !shared.has(f) && !mine.has(key(f)));
  return { unclaimed, clashes: overlaps(unclaimed, claims, self, shared) };
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
