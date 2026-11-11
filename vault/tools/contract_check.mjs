#!/usr/bin/env node
// Contract check (EZD-383; PLANNING-REDESIGN.md 1.2 step P3): every path, export and signature a template v2 plan says
// exists is at the checkout's HEAD, and every one it marks new is not. Node built-ins only; no network.
//   node vault/tools/contract_check.mjs <plan> [--root <dir>]   CONTRACT CHECK OK | SKIP | FAIL (n) and one problem per line | ERROR
// Exit 0 OK or SKIP (a v1 plan), 1 FAIL, 2 usage or a read error (fails closed, L-059).
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, block, tables, templateVersion } from './plan_lint.mjs';
import { trustedGit, TrustedGitError } from './trusted-git.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN_MAX = 2000000;
const BAR = '';

export class HeadError extends Error {}

// D-Form: a repo-relative path of the shape every tracked path has.
export function isRepoPath(p) {
  if (typeof p !== 'string' || p.length < 1 || p.length > 300) return false;
  if (!/^[A-Za-z0-9._@+()[\]][A-Za-z0-9._@+()[\]/-]*$/.test(p)) return false;
  if (!p.includes('/') && !p.includes('.')) return false;
  if (p.includes('//') || p.endsWith('/')) return false;
  return !p.split('/').some((x) => x === '.' || x === '..');
}

const firstSpan = (cell) => { const m = /`([^`]*)`/.exec(cell); return m ? m[1] : null; };
// D-Token: the first backtick span, else the first word, else ''.
const token = (cell) => { const s = firstSpan(cell); if (s !== null) return s; const w = String(cell).trim().split(/\s+/)[0]; return w || ''; };
const dropLine = (p) => p.replace(/:\d{1,7}(-\d{1,7})?$/, '');

// D-Path: the path a cell names, or null.
export function cellPath(cell) {
  const p = dropLine(token(cell));
  return isRepoPath(p) ? p : null;
}

function gitDetail(r) {
  if (r.signal) return `signal ${r.signal}`;
  if (r.error) return r.error.code || r.error.message;
  const line = String(r.stderr || '').split('\n').map((l) => l.trim()).find(Boolean);
  return line || `exit ${r.status}`;
}

// D-Head: the code facts at HEAD of root, read once (paths) and per file (text, cached).
export function readHead(root) {
  let r;
  try { r = trustedGit(root, ['ls-tree', '-r', '-z', '--full-tree', '--name-only', 'HEAD'], { maxBuffer: 64 * 1024 * 1024, timeout: 30000 }); }
  catch (e) { throw new HeadError(`cannot read HEAD of ${root}: ${e instanceof TrustedGitError ? e.message : (e.code || e.message)}`); }
  if (r.error || r.status !== 0) throw new HeadError(`cannot read HEAD of ${root}: ${gitDetail(r)}`);
  const paths = Object.freeze(String(r.stdout).split('\0').filter(Boolean));
  const set = new Set(paths);
  const cache = new Map();
  const text = (p) => {
    if (!set.has(p)) return null;
    if (cache.has(p)) return cache.get(p);
    let c;
    try { c = trustedGit(root, ['cat-file', 'blob', `HEAD:${p}`], { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }); }
    catch (e) { throw new HeadError(`cannot read ${p} at HEAD: ${e instanceof TrustedGitError ? e.message : (e.code || e.message)}`); }
    if (c.error || c.status !== 0) throw new HeadError(`cannot read ${p} at HEAD: ${gitDetail(c)}`);
    const t = String(c.stdout);
    cache.set(p, t);
    return t;
  };
  return {
    paths,
    has: (p) => set.has(p),
    isFolder: (p) => paths.some((x) => x.startsWith(p + '/')),
    text,
    lines: (p) => { const t = text(p); if (t === null) return null; if (t === '') return 0; const parts = t.split('\n'); return t.endsWith('\n') ? parts.length - 1 : parts.length; },
  };
}

// D-Exports: the names a module exports, and whether it has an unresolved `export * from`.
export function exportedNames(text) {
  const src = String(text).replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class|abstract\s+class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  if (/^export\s+default\b/m.test(src)) names.add('default');
  for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (let part of m[1].split(',')) {
      part = part.trim().replace(/^type\s+/, '');
      if (!part) continue;
      const as = /\s+as\s+([A-Za-z_$][\w$]*)$/.exec(part);
      names.add(as ? as[1] : part);
    }
  }
  for (const m of src.matchAll(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)) names.add(m[1]);
  return { names, star: /^export\s+\*\s+from/m.test(src) };
}

// D-Params: the number of parameters in a parameter list's text.
export function paramCount(params) {
  const s = String(params);
  if (!s.trim()) return 0;
  let depth = 0; let commas = 0; let last = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < s.length && !(s[j] === ch && s[j - 1] !== '\\')) j++;
      i = j;
      if (depth === 0) last = ch;
      continue;
    }
    if ('([{<'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === '>' && s[i - 1] !== '=') depth--;
    else if (ch === ',' && depth === 0) commas++;
    if (depth === 0 && !/\s/.test(ch)) last = ch;
  }
  return commas + 1 - (last === ',' ? 1 : 0);
}

// The text between the `(` at index open and its matching `)`, under the D-Params depth rules; null when unmatched.
function inParens(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < s.length && !(s[j] === ch && s[j - 1] !== '\\')) j++;
      i = j;
      continue;
    }
    if ('([{<'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { depth--; if (depth === 0 && ch === ')') return s.slice(open + 1, i); }
    else if (ch === '>' && s[i - 1] !== '=') depth--;
  }
  return null;
}

// D-Parse: tables of a block with `\|` kept inside one cell.
export function blockTables(text) {
  return tables(String(text).replace(/\\\|/g, BAR)).map((t) => ({
    head: t.head.map((c) => c.split(BAR).join('|')),
    body: t.body.map((r) => r.map((c) => c.split(BAR).join('|'))),
  }));
}
const col = (head, name) => head.indexOf(name);
const unBacktick = (s) => String(s).replace(/`/g, '').trim();
const JS_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts)$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The Interface contract table: the first table in section 3 before its first `### ` line.
function contractTable(s3) {
  const cut = /^### /m.exec(s3);
  const t = blockTables(cut ? s3.slice(0, cut.index) : s3);
  return t[0] || null;
}

// D-Name for export and signature rows: { name, path, params } or null.
function parseName(kind, cell) {
  const c = String(cell).trim();
  if (kind === 'export') {
    const m = /^`([A-Za-z_$][\w$]*)`\s+from\s+`?([^`\s]+)`?$/.exec(c);
    return m ? { name: m[1], path: m[2] } : null;
  }
  const m = /^`([A-Za-z_$][\w$]*)\(/.exec(c);
  if (!m) return null;
  const end = c.indexOf('`', 1);
  if (end < 0) return null;
  const span = c.slice(1, end);
  const params = inParens(span, m[1].length);
  if (params === null) return null;
  const rest = /^\s+from\s+`?([^`\s]+)`?$/.exec(c.slice(end + 1));
  if (!rest) return null;
  return { name: m[1], path: rest[1], params };
}

function headParams(text, name) {
  const n = esc(name);
  const res = [
    new RegExp(`^export\\s+(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*(?:<[^>]*>)?\\s*\\(`, 'm'),
    new RegExp(`^export\\s+(?:const|let|var)\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:<[^>]*>\\s*)?\\(`, 'm'),
    new RegExp(`^export\\s+(?:const|let|var)\\s+${n}\\s*=\\s*(?:async\\s+)?function\\s*\\*?\\s*[\\w$]*\\s*\\(`, 'm'),
  ];
  for (const re of res) {
    const m = re.exec(text);
    if (m) return inParens(text, m.index + m[0].length - 1);
  }
  return null;
}

export function checkContract(text, { root = ROOT, head = null } = {}) {
  if (templateVersion(text) !== 2) return [];
  const h = head || readHead(root);
  const s = sections(text);
  const problems = [];

  // (1) Build steps.
  const steps = block(s[1] || '', 'Build steps');
  const st = steps === null ? null : blockTables(steps)[0];
  if (!st || !st.body.length) problems.push('section 1: no Build steps table');
  else {
    const [ip, ik, ic] = ['Path', 'New / change', 'Copy the pattern from'].map((n) => col(st.head, n));
    if (ip < 0 || ik < 0 || ic < 0) problems.push('section 1: Build steps table lacks the Path, New / change or Copy the pattern from column');
    else st.body.forEach((row, k) => {
      const i = k + 1;
      const cell = row[ip] || '';
      const spans = [...cell.matchAll(/`([^`]*)`/g)].map((m) => dropLine(m[1])).filter(isRepoPath);
      let p = null;
      if (spans.length > 1) problems.push(`section 1: Build steps row ${i}: names more than one path (one row per file)`);
      else { p = cellPath(cell); if (p === null) problems.push(`section 1: Build steps row ${i}: "${token(cell)}" is not a repo-relative file path`); }
      const kindCell = (row[ik] || '').trim();
      const kind = (kindCell.split(/\s+/)[0] || '').toLowerCase();
      if (kind !== 'new' && kind !== 'change') problems.push(`section 1: Build steps row ${i}: New / change is "${kindCell}", not new or change`);
      else if (p !== null) {
        if (kind === 'new' && h.has(p)) problems.push(`section 1: Build steps row ${i}: ${p} is marked new but is at HEAD`);
        else if (kind === 'new' && h.isFolder(p)) problems.push(`section 1: Build steps row ${i}: ${p} is marked new but is a folder at HEAD`);
        else if (kind === 'change' && !h.has(p)) problems.push(`section 1: Build steps row ${i}: ${p} is marked change but is not at HEAD`);
      }
      const pat = row[ic] || '';
      if (!/^none/i.test(unBacktick(pat))) {
        const pp = cellPath(pat);
        if (pp === null) problems.push(`section 1: Build steps row ${i}: Copy the pattern from "${pat.trim()}" names no repo path (write a path, or start with none)`);
        else if (!h.has(pp)) problems.push(`section 1: Build steps row ${i}: pattern file ${pp} is not at HEAD`);
      }
    });
  }

  // (2) Interface contract.
  const s3 = s[3] || '';
  const ct = contractTable(s3);
  if (!ct) problems.push('section 3: Interface contract: no table before the first ### block');
  else {
    const ik = ct.head.findIndex((x) => /^Kind/.test(x));
    const iname = col(ct.head, 'Name or path');
    if (ik < 0 || iname < 0) problems.push('section 3: Interface contract table lacks the Kind or Name or path column');
    else ct.body.forEach((row, k) => {
      const i = k + 1;
      const kc = unBacktick(row[ik] || '').toLowerCase();
      const word = kc.split(/[\s(]/)[0];
      if (!['file', 'export', 'signature'].includes(word)) return;
      const m = /^(file|export|signature) ?\((new|exists)\)$/.exec(kc);
      if (!m) { problems.push(`section 3: Interface contract row ${i}: ${word} row needs (new) or (exists) in its Kind cell`); return; }
      const mark = m[2];
      const cell = row[iname] || '';
      if (word === 'file') {
        const p = cellPath(cell);
        if (p === null) { problems.push(`section 3: Interface contract row ${i}: "${token(cell)}" is not a repo-relative file path`); return; }
        if (mark === 'new' && h.has(p)) problems.push(`section 3: Interface contract row ${i}: file ${p} is marked new but is at HEAD`);
        if (mark === 'exists' && !h.has(p)) problems.push(`section 3: Interface contract row ${i}: file ${p} is marked exists but is not at HEAD`);
        return;
      }
      const parsed = parseName(word, cell);
      if (!parsed) { problems.push(`section 3: Interface contract row ${i}: Name "${cell.trim()}" is not \`name\` from path (an export) or \`name(params)\` from path (a signature)`); return; }
      const { name, path: p } = parsed;
      if (!isRepoPath(p)) { problems.push(`section 3: Interface contract row ${i}: "${p}" is not a repo-relative file path`); return; }
      if (!JS_EXT.test(p)) { problems.push(`section 3: Interface contract row ${i}: ${p} is not a JavaScript or TypeScript file, so its exports cannot be checked`); return; }
      if (mark === 'new') {
        if (h.has(p) && exportedNames(h.text(p)).names.has(name)) problems.push(`section 3: Interface contract row ${i}: ${name} is marked new but ${p} exports it at HEAD`);
        return;
      }
      if (!h.has(p)) { problems.push(`section 3: Interface contract row ${i}: ${name} is marked exists but ${p} is not at HEAD`); return; }
      const ex = exportedNames(h.text(p));
      if (!ex.names.has(name)) { problems.push(`section 3: Interface contract row ${i}: ${p} does not export ${name} at HEAD${ex.star ? ' (it has export *; name the file that declares it)' : ''}`); return; }
      if (word === 'signature') {
        const hp = headParams(h.text(p), name);
        if (hp === null) { problems.push(`section 3: Interface contract row ${i}: cannot read the parameters of ${name} in ${p} at HEAD (declare it as export function or export const ${name} = (...) =>)`); return; }
        const a = paramCount(hp); const b = paramCount(parsed.params);
        if (a !== b) problems.push(`section 3: Interface contract row ${i}: ${name} takes ${a} parameters at HEAD; the plan gives ${b}`);
      }
    });
  }

  // (3) Connections, (4) Shared lists, (5) Regression list.
  const conn = block(s3, 'Connections');
  if (conn !== null) {
    const t = blockTables(conn)[0];
    if (t && t.body.length) {
      const ifl = col(t.head, 'File:line');
      if (ifl < 0) problems.push('section 3: Connections table lacks the File:line column');
      else t.body.forEach((row, k) => {
        const i = k + 1;
        for (const item of unBacktick(row[ifl] || '').split(/\s*[,;]\s*/).filter(Boolean)) {
          const m = /^([^\s:]+):([1-9]\d{0,6})(?:-([1-9]\d{0,6}))?$/.exec(item);
          if (!m || !isRepoPath(m[1])) { problems.push(`section 3: Connections row ${i}: "${item}" is not <path>:<line>`); continue; }
          if (!h.has(m[1])) { problems.push(`section 3: Connections row ${i}: ${m[1]} is not at HEAD`); continue; }
          const a = Number(m[2]); const b = m[3] ? Number(m[3]) : a;
          if (b < a) { problems.push(`section 3: Connections row ${i}: "${item}" ends before it starts`); continue; }
          const n = h.lines(m[1]);
          if (b > n) problems.push(`section 3: Connections row ${i}: ${m[1]} has ${n} lines at HEAD; line ${b} is past its end`);
        }
      });
    }
  }
  for (const [n, title, where] of [[3, 'Shared lists', 'section 3: Shared lists'], [4, 'Regression list', 'section 4: Regression list']]) {
    const b = block(s[n] || '', title);
    if (b === null) continue;
    const t = blockTables(b)[0];
    if (!t || !t.body.length) continue;
    const it = col(t.head, 'Test file');
    if (it < 0) { problems.push(`section ${n}: ${title} table lacks the Test file column`); continue; }
    t.body.forEach((row, k) => {
      const i = k + 1;
      const p = cellPath(row[it] || '');
      if (p === null) problems.push(`${where} row ${i}: "${token(row[it] || '')}" is not a repo-relative file path`);
      else if (!h.has(p)) problems.push(`${where} row ${i}: ${p} is not at HEAD`);
    });
  }
  return problems;
}

// Shared CLI for both checks (D-CLI).
export function runCli(name, script, check, argv) {
  const usage = () => { console.log(`usage: node vault/tools/${script} <plan> [--root <dir>]`); return 2; };
  let plan = null; let root = ROOT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') { if (i + 1 >= argv.length) return usage(); root = argv[++i]; }
    else if (a.startsWith('--')) return usage();
    else if (plan === null) plan = a;
    else return usage();
  }
  if (plan === null) return usage();
  const err = (m) => { console.log(`${name} CHECK ERROR ${plan}: ${m}`); return 2; };
  let text;
  try {
    if (lstatSync(plan).size > PLAN_MAX) return err(`the plan is over ${PLAN_MAX} bytes`);
    text = readFileSync(plan, 'utf8');
  } catch (e) { return err(`cannot read the plan: ${e.code || e.message}`); }
  if (templateVersion(text) !== 2) { console.log(`${name} CHECK SKIP ${plan}: template v1`); return 0; }
  let problems;
  try { problems = check(text, { root }); } catch (e) { return err(e.message); }
  if (!problems.length) { console.log(`${name} CHECK OK ${plan}`); return 0; }
  console.log(`${name} CHECK FAIL ${plan} (${problems.length})`);
  for (const p of problems) console.log(`- ${p}`);
  return 1;
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exit(runCli('CONTRACT', 'contract_check.mjs', checkContract, process.argv.slice(2)));
