#!/usr/bin/env node
// Connections check (EZD-383; PLANNING-REDESIGN.md 1.4): every entry of the shared-list register (vault/shared-lists.json)
// whose pinned list a template v2 plan's changed files reach has a row in the plan's Connections table.
//   node vault/tools/connections_check.mjs <plan> [--root <dir>]   CONNECTIONS CHECK OK | SKIP | FAIL (n) | ERROR
// Exit 0 OK or SKIP (a v1 plan), 1 FAIL, 2 usage or a read error (fails closed, L-059). Node built-ins only.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, block, templateVersion } from './plan_lint.mjs';
import { ROOT, readHead, isRepoPath, cellPath, blockTables, runCli } from './contract_check.mjs';

const REGISTER_MAX = 1000000;
const KEYS = ['id', 'list', 'test', 'pin', 'reaches', 'read', 'sources'];
const ROOT_KEYS = ['version', 'lists'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOURCE_RE = /^(L-\d{3}|EZD-\d+[a-z]?)$/;

export class RegisterError extends Error {}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x, max) => typeof x === 'string' && x.length >= 1 && x.length <= max;

// D-Glob: the allowed glob form.
function globOk(g) {
  if (typeof g !== 'string' || g.length < 1 || g.length > 300) return false;
  if (!/^[A-Za-z0-9._\-/*]+$/.test(g) || g.startsWith('/')) return false;
  return !g.split('/').some((x) => x === '' || x === '.' || x === '..');
}
const matches = (file, glob) => path.matchesGlob(file, glob);

// D-RegRead, D-RegCheck: read and validate the register; invalid entries are reported and left out.
export function loadRegister(file, head) {
  let raw;
  try {
    if (lstatSync(file).size > REGISTER_MAX) throw new RegisterError(`the register ${file} is over ${REGISTER_MAX} bytes`);
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    if (e instanceof RegisterError) throw e;
    throw new RegisterError(`cannot read the register ${file}: ${e.code || e.message}`);
  }
  let data;
  try { data = JSON.parse(raw); } catch (e) { throw new RegisterError(`the register ${file} is not JSON: ${e.message}`); }
  const problems = [];
  const lists = [];
  if (!isObj(data)) return { lists, problems: ['register: the register must be a JSON object'] };
  for (const k of Object.keys(data)) if (!ROOT_KEYS.includes(k)) problems.push(`register: unknown key ${k}`);
  if (data.version !== 1) problems.push('register: version must be 1');
  if (!Array.isArray(data.lists) || data.lists.length < 1 || data.lists.length > 500) {
    problems.push('register: lists must be an array of 1 to 500 entries');
    return { lists, problems };
  }
  const seen = new Set();
  data.lists.forEach((e, k) => {
    const i = k + 1;
    if (!isObj(e)) { problems.push(`register entry ${i}: must be an object`); return; }
    if (typeof e.id !== 'string' || e.id.length < 1 || e.id.length > 60 || !ID_RE.test(e.id)) { problems.push(`register entry ${i}: id must be 1 to 60 of a-z, 0-9 and single hyphens`); return; }
    const id = e.id;
    if (seen.has(id)) { problems.push(`register ${id}: duplicate id`); return; }
    seen.add(id);
    const unknown = Object.keys(e).find((x) => !KEYS.includes(x));
    if (unknown) { problems.push(`register ${id}: unknown key ${unknown}`); return; }
    const missing = KEYS.find((x) => !(x in e));
    if (missing) { problems.push(`register ${id}: missing key ${missing}`); return; }
    if (!str(e.list, 200)) { problems.push(`register ${id}: list must be a string of 1 to 200 characters`); return; }
    if (typeof e.test !== 'string' || !isRepoPath(e.test)) { problems.push(`register ${id}: test "${e.test}" is not a repo-relative file path`); return; }
    if (!head.has(e.test)) { problems.push(`register ${id}: test ${e.test} is not at HEAD`); return; }
    if (!str(e.pin, 200)) { problems.push(`register ${id}: pin must be a string of 1 to 200 characters`); return; }
    if (!head.text(e.test).includes(e.pin)) { problems.push(`register ${id}: pin "${e.pin}" is not in ${e.test} at HEAD`); return; }
    if (!Array.isArray(e.reaches) || e.reaches.length < 1 || e.reaches.length > 50) { problems.push(`register ${id}: reaches must be an array of 1 to 50 globs`); return; }
    const bad = e.reaches.find((g) => !globOk(g));
    if (bad !== undefined) { problems.push(`register ${id}: glob "${bad}" may use only letters, digits, . _ - / and *, with no empty, . or .. part and no leading /`); return; }
    const dead = e.reaches.find((g) => !head.paths.some((p) => matches(p, g)));
    if (dead !== undefined) { problems.push(`register ${id}: glob "${dead}" matches no file at HEAD`); return; }
    if (!str(e.read, 300)) { problems.push(`register ${id}: read must be a string of 1 to 300 characters`); return; }
    if (!Array.isArray(e.sources) || e.sources.length < 1 || e.sources.length > 20 || !e.sources.every((x) => typeof x === 'string' && SOURCE_RE.test(x))) { problems.push(`register ${id}: sources must be an array of 1 to 20 IDs like L-021 or EZD-292`); return; }
    lists.push(e);
  });
  return { lists, problems };
}

const unBacktick = (s) => String(s).replace(/`/g, '').trim();
const ITEM_RE = /^([^\s:]+):([1-9]\d{0,6})(?:-([1-9]\d{0,6}))?$/;
const tokenRe = (id) => new RegExp(`(^|[^a-z0-9-])${id.replace(/-/g, '\\-')}($|[^a-z0-9-])`);

export function checkConnections(text, { root = ROOT, register = null, head = null } = {}) {
  if (templateVersion(text) !== 2) return [];
  const h = head || readHead(root);
  const { lists, problems } = loadRegister(register || path.join(root, 'vault', 'shared-lists.json'), h);
  const s = sections(text);

  // Changed files: every Build steps Path cell (D-Reach, D-Row1).
  const steps = block(s[1] || '', 'Build steps');
  const st = steps === null ? null : blockTables(steps)[0];
  const ip = st ? st.head.indexOf('Path') : -1;
  if (!st || !st.body.length || ip < 0) {
    problems.push('section 1: no Build steps table, so the changed files cannot be read');
    if (block(s[3] || '', 'Connections') === null) problems.push('section 3: no ### Connections table');
    return problems;
  }
  const changed = [];
  st.body.forEach((row, k) => {
    const i = k + 1;
    const cell = row[ip] || '';
    const spans = [...cell.matchAll(/`([^`]*)`/g)].map((m) => m[1].replace(/:\d{1,7}(-\d{1,7})?$/, '')).filter(isRepoPath);
    if (spans.length > 1) { problems.push(`section 1: Build steps row ${i}: names more than one path (one row per file)`); changed.push(...spans); return; }
    const p = cellPath(cell);
    if (p === null) { const m = /`([^`]*)`/.exec(cell); problems.push(`section 1: Build steps row ${i}: "${m ? m[1] : (cell.trim().split(/\s+/)[0] || '')}" is not a repo-relative file path`); return; }
    changed.push(p);
  });

  const conn = block(s[3] || '', 'Connections');
  if (conn === null) { problems.push('section 3: no ### Connections table'); return problems; }
  const ct = blockTables(conn)[0];
  const rows = [];
  if (ct && ct.body.length) {
    const iname = ct.head.indexOf('Name');
    const ifl = ct.head.indexOf('File:line');
    if (iname >= 0 && ifl >= 0) for (const row of ct.body) {
      const items = unBacktick(row[ifl] || '').split(/\s*[,;]\s*/).map((x) => ITEM_RE.exec(x)).filter(Boolean).map((m) => m[1]);
      rows.push({ name: unBacktick(row[iname] || ''), paths: items });
    }
  }
  for (const e of lists) {
    const reached = changed.filter((f) => e.reaches.some((g) => matches(f, g)));
    if (!reached.length) continue;
    const re = tokenRe(e.id);
    if (rows.some((r) => re.test(r.name) && r.paths.includes(e.test))) continue;
    problems.push(`section 3: Connections: shared list ${e.id} (${e.list}) is reached by ${[...new Set(reached)].join(', ')}; add a Connections row naming ${e.id} in Name and ${e.test}:<line> in File:line (pin "${e.pin}")`);
  }
  return problems;
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exit(runCli('CONNECTIONS', 'connections_check.mjs', checkConnections, process.argv.slice(2)));
