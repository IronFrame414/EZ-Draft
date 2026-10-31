// PreToolUse on Read and Bash: a text file over GUARD_WHOLE_READ_CHARS is not loaded whole; the caller gets its outline
// and reads by range (vault/handoff/PA3-MECHANISMS.md Item 3; vault/PROCESS.md section 10). Fails open on any error.
// A notebook (.ipynb) over the limit is denied even with offset, limit or pages, because the Read tool ignores them on
// notebooks and returns every cell; its denial ends with NOTEBOOK_SENTENCE instead (EZD-198; vault/handoff/PILOT.md row 13).
// A ranged head, tail or sed -n read is denied when the text it selects from one file is over the limit (one long line
// prints whole); its denial ends with RANGE_SENTENCE (EZD-199; Q-0344).
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { readInput, deny, norm, projectDir, repoRelative, canonicalPath, repoRoot, caseInsensitiveDisk, pathIn } from './lib.mjs';
import { outline } from '../../vault/tools/outline.mjs';

const BINARY_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf'];
const SENTENCE = 'Read the ranges you need with offset and limit.';
const NOTEBOOK_SENTENCE = "The Read tool ignores offset and limit on notebooks: read the ranges you need with sed -n 'a,bp'.";
const isNotebook = (p) => path.extname(p).toLowerCase() === '.ipynb';

function threshold() {
  const v = process.env.GUARD_WHOLE_READ_CHARS;
  return v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 20000;
}

// Exempt entries are judged on resolved paths (EZD-260): a repo entry against repoRelative (links followed); an absolute
// entry by its resolved folder plus its own name, so a link placed at an exempt name is not exempt.
function entryPath(e) {
  const dir = canonicalPath(path.posix.dirname(norm(e)), '/');
  return dir === null ? null : `${dir}/${path.posix.basename(norm(e))}`;
}
function exempt(abs, cwd) {
  const list = (process.env.GUARD_WHOLE_READ_EXEMPT || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  const fold = caseInsensitiveDisk(repoRoot());
  const rel = repoRelative(abs, cwd);
  if (rel !== null) return pathIn(list, rel, fold);
  const real = canonicalPath(abs, cwd);
  return real !== null && list.some((e) => {
    if (!e.startsWith('/')) return false;
    const ep = entryPath(e);
    return ep !== null && pathIn([ep], real, fold);
  });
}

// Returns { text, chars } for a large text file, otherwise null.
function largeFile(given, cwd, T) {
  try {
    const abs = path.resolve(cwd, given);
    const st = statSync(abs);
    if (!st.isFile() || st.size <= T) return null;
    if (BINARY_EXT.includes(path.extname(abs).toLowerCase())) return null;
    const fd = openSync(abs, 'r');
    const buf = Buffer.alloc(Math.min(8000, st.size));
    readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    if (buf.includes(0)) return null;
    if (exempt(abs, cwd)) return null;
    const text = readFileSync(abs, 'utf8');
    return text.length > T ? { text, chars: text.length, abs } : null;
  } catch { return null; }
}

function reason(given, big, T) {
  return [`Whole read blocked: ${given} has ${big.chars} characters (limit ${T}, GUARD_WHOLE_READ_CHARS).`,
    ...outline(big.text, big.abs), isNotebook(big.abs) ? NOTEBOOK_SENTENCE : SENTENCE].join('\n');
}

function stripHeredocs(cmd) {
  const out = [];
  let end = null;
  for (const line of cmd.split('\n')) {
    if (end !== null) { if (line.trim() === end) end = null; continue; }
    out.push(line);
    const m = line.match(/(?<!<)<<(?!<)-?\s*['"]?(\w+)['"]?/);
    if (m) end = m[1];
  }
  return out.join('\n');
}

// Shell-style words; no expansion. Returns segments: { words, redirs, piped }.
function parse(cmd) {
  const segs = [];
  let seg = { words: [], redirs: [], piped: false };
  let cur = '', has = false, pending = null;
  const endWord = () => {
    if (!has) return;
    if (pending) { pending.target = cur; pending = null; } else seg.words.push(cur);
    cur = ''; has = false;
  };
  const endSeg = (piped) => { endWord(); seg.piped = piped; segs.push(seg); seg = { words: [], redirs: [], piped: false }; pending = null; };
  const s = cmd;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") { const j = s.indexOf("'", i + 1); const e = j < 0 ? s.length : j; cur += s.slice(i + 1, e); has = true; i = e; continue; }
    if (ch === '"') {
      i++; has = true;
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) i++; cur += s[i]; i++; }
      continue;
    }
    if (ch === '\\') { if (i + 1 < s.length) { cur += s[i + 1]; has = true; i++; } continue; }
    if (ch === '\n' || ch === ';') { endSeg(false); continue; }
    if (ch === '|') { const two = s[i + 1] === '|'; endSeg(!two); if (two) i++; continue; }
    if (ch === '&') {
      if (s[i + 1] === '&') { endSeg(false); i++; continue; }
      if (s[i + 1] === '>') { endWord(); i++; if (s[i + 1] === '>') i++; pending = { op: '&>', fd: '' }; seg.redirs.push(pending); continue; }
      endSeg(false); continue;
    }
    if (ch === '>' || ch === '<') {
      let fd = '';
      if (has && /^\d+$/.test(cur)) { fd = cur; cur = ''; has = false; } else endWord();
      let op = ch;
      if (ch === '>' && s[i + 1] === '>') { op = '>>'; i++; }
      if (ch === '>' && s[i + 1] === '&' && /\d|-/.test(s[i + 2] || '')) { i += 2; while (/\d|-/.test(s[i + 1] || '')) i++; seg.redirs.push({ op: '>&', fd, target: '' }); continue; }
      pending = { op, fd }; seg.redirs.push(pending);
      continue;
    }
    if (/\s/.test(ch)) { endWord(); continue; }
    cur += ch; has = true;
  }
  endSeg(false);
  return segs;
}

const RANGE_PART = /^\s*(\d+)(?:\s*,\s*(\d+))?\s*p\s*$/;
const COUNT = /^\+?\d+$/;
const RANGE_SENTENCE = "Narrow the range: fewer lines with sed -n 'a,bp' or head -n K, or part of one long line with head -c K or sed -n 'Np' | cut -c a-b.";

// Returns null when the segment is not a checked read command, else { cmd, operands, range }. range is null for an
// unranged read, whose operands include every < target; for a ranged read it is { unit, count, plus } (head, tail) or
// { parts: [[a, b]] } (sed), and the operands are the file words, or the < targets when there are none (EZD-199).
function readCommand(seg) {
  if (seg.piped) return null;
  if (seg.redirs.some((r) => ['>', '>>', '&>'].includes(r.op) && (r.fd === '' || r.fd === '1'))) return null;
  const w = [...seg.words];
  while (w.length && /^[A-Za-z_]\w*=/.test(w[0])) w.shift();
  if (!w.length) return null;
  const cmd = path.basename(w[0]);
  if (!['cat', 'head', 'tail', 'sed', 'less'].includes(cmd)) return null;
  const args = w.slice(1);
  const stdinOps = seg.redirs.filter((r) => r.op === '<' && r.target).map((r) => r.target);
  let range = null, operands = [], opts = true;
  const count = (unit, k) => { range = { unit, count: Number(k.replace('+', '')), plus: k.startsWith('+') }; };
  if (cmd === 'cat' || cmd === 'less') {
    for (const a of args) { if (opts && a === '--') { opts = false; continue; } if (!opts || !a.startsWith('-')) operands.push(a); }
  } else if (cmd === 'head' || cmd === 'tail') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (opts && a === '--') { opts = false; continue; }
      if (!opts || !a.startsWith('-')) { operands.push(a); continue; }
      let m;
      if (a === '-n' || a === '-c' || a === '--lines' || a === '--bytes') {
        const k = args[i + 1] || '';
        if (COUNT.test(k)) count(a === '-c' || a === '--bytes' ? 'bytes' : 'lines', k);
        i++;
      } else if ((m = a.match(/^(-n|-c|--lines=|--bytes=)(.*)$/))) { if (COUNT.test(m[2])) count(m[1] === '-c' || m[1] === '--bytes=' ? 'bytes' : 'lines', m[2]); }
      else if (/^-\d+$/.test(a)) count('lines', a.slice(1));
    }
  } else {
    const quiet = args.some((a) => (/^-[^-]/.test(a) && a.includes('n')) || a === '--quiet' || a === '--silent');
    if (!quiet) return null;
    if (args.some((a) => a === '--in-place' || /^-[A-Za-z]*i/.test(a))) return null;
    const scripts = []; let fscript = false, plain = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (opts && a === '--') { opts = false; continue; }
      if (opts && a === '-e') { scripts.push(args[++i] ?? ''); continue; }
      if (opts && a === '-f') { fscript = true; i++; continue; }
      if (!opts || !a.startsWith('-')) plain.push(a);
    }
    if (!scripts.length && plain.length) scripts.push(plain.shift());
    operands = plain;
    const parts = scripts.flatMap((sc) => sc.split(/[;\n]/).filter((p) => p.trim()));
    if (!fscript && scripts.length > 0 && parts.every((p) => RANGE_PART.test(p))) {
      range = { parts: parts.map((p) => { const m = p.match(RANGE_PART); return [Number(m[1]), Number(m[2] ?? m[1])]; }) };
    }
  }
  if (!range) return { cmd, operands: [...operands, ...stdinOps], range };
  return { cmd, operands: operands.length ? operands : stdinOps, range };
}

// Lines of a text without their newlines; a final newline ends the last line and an empty text has none.
const linesOf = (s) => (s === '' ? [] : (s.endsWith('\n') ? s.slice(0, -1) : s).split('\n'));

// Characters head or tail prints from one file: a line counts its length plus 1; a byte range counts the selected
// bytes decoded as UTF-8.
function headTailChars(cmd, r, buf) {
  if (r.unit === 'bytes') {
    const part = cmd === 'head' ? buf.subarray(0, r.count)
      : r.plus ? buf.subarray(Math.max(r.count - 1, 0)) : buf.subarray(Math.max(buf.length - r.count, 0));
    return part.toString('utf8').length;
  }
  const lines = linesOf(buf.toString('utf8'));
  const sel = cmd === 'head' ? lines.slice(0, r.count)
    : r.plus ? lines.slice(Math.max(r.count - 1, 0)) : r.count === 0 ? [] : lines.slice(-r.count);
  return sel.reduce((n, l) => n + l.length + 1, 0);
}

// The first file a ranged read selects more than T characters from, as { given, chars }, else null. sed numbers lines
// across its files in order and prints a line once per part that covers it; line 0 is never printed. Missing files add
// no lines; binary and exempt files add lines but are not counted.
function rangedOver(rc, cwd, T) {
  const sed = rc.cmd === 'sed';
  const files = [];
  for (const given of rc.operands) {
    try {
      const abs = path.resolve(cwd, given);
      const st = statSync(abs);
      if (st.isFile()) files.push({ given, abs, size: st.size });
    } catch { /* missing: sed reads no lines from it */ }
  }
  if (files.reduce((n, f) => n + f.size, 0) * (sed ? rc.range.parts.length : 1) <= T) return null;
  let line = 0;
  for (const f of files) {
    if (!sed && f.size <= T) continue;
    const buf = readFileSync(f.abs);
    const skip = BINARY_EXT.includes(path.extname(f.abs).toLowerCase()) || buf.subarray(0, 8000).includes(0) || exempt(f.abs, cwd);
    let chars = 0;
    if (sed) {
      for (const l of linesOf(buf.toString('utf8'))) {
        line++;
        if (!skip) for (const [a, b] of rc.range.parts) if (a > 0 && line >= a && line <= Math.max(a, b)) chars += l.length + 1;
      }
    } else if (!skip) chars = headTailChars(rc.cmd, rc.range, buf);
    if (chars > T) return { given: f.given, chars };
  }
  return null;
}

function rangedReason(over, T) {
  return [`Ranged read blocked: the range selects ${over.chars} characters of ${over.given} (limit ${T}, GUARD_WHOLE_READ_CHARS).`,
    RANGE_SENTENCE].join('\n');
}

try {
  const input = readInput();
  const tool = input.tool_name;
  if (tool === 'Read' || tool === 'Bash') {
    const cwd = input.cwd || projectDir();
    const T = threshold();
    const ti = input.tool_input || {};
    if (tool === 'Read') {
      const none = (v) => v === undefined || v === null;
      if (typeof ti.file_path === 'string' && (isNotebook(ti.file_path) || (none(ti.offset) && none(ti.limit) && none(ti.pages)))) {
        const big = largeFile(ti.file_path, cwd, T);
        if (big) deny(reason(ti.file_path, big, T));
      }
    } else {
      for (const seg of parse(stripHeredocs(String(ti.command || '')))) {
        const rc = readCommand(seg);
        if (!rc) continue;
        if (rc.range) {
          const over = rangedOver(rc, cwd, T);
          if (over) deny(rangedReason(over, T));
          continue;
        }
        for (const op of rc.operands) {
          const big = largeFile(op, cwd, T);
          if (big) deny(reason(op, big, T));
        }
      }
    }
  }
} catch { /* fail open */ }
process.exit(0);
