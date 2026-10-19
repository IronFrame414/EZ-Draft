// PreToolUse on Read and Bash: a text file over GUARD_WHOLE_READ_CHARS is not loaded whole; the caller gets its outline
// and reads by range (vault/handoff/PA3-MECHANISMS.md Item 3; vault/PROCESS.md section 10). Fails open on any error.
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { readInput, deny, norm, projectDir, repoRelative } from './lib.mjs';
import { outline } from '../../vault/tools/outline.mjs';

const BINARY_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf'];
const SENTENCE = 'Read the ranges you need with offset and limit.';

function threshold() {
  const v = process.env.GUARD_WHOLE_READ_CHARS;
  return v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : 20000;
}

function exempt(abs, cwd) {
  const list = (process.env.GUARD_WHOLE_READ_EXEMPT || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return false;
  const rel = repoRelative(abs, cwd);
  return list.includes(rel === null ? norm(path.resolve(abs)) : rel);
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
    ...outline(big.text, big.abs), SENTENCE].join('\n');
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

const RANGE_PART = /^\s*\d+(\s*,\s*\d+)?\s*p\s*$/;
const COUNT = /^\+?\d+$/;

// Returns the operands of an unranged read command in the segment, or [] when it is not one.
function unrangedOperands(seg) {
  if (seg.piped) return [];
  if (seg.redirs.some((r) => ['>', '>>', '&>'].includes(r.op) && (r.fd === '' || r.fd === '1'))) return [];
  const w = [...seg.words];
  while (w.length && /^[A-Za-z_]\w*=/.test(w[0])) w.shift();
  if (!w.length) return [];
  const cmd = path.basename(w[0]);
  if (!['cat', 'head', 'tail', 'sed', 'less'].includes(cmd)) return [];
  const args = w.slice(1);
  const stdinOps = seg.redirs.filter((r) => r.op === '<' && r.target).map((r) => r.target);
  let ranged = false, operands = [], opts = true;
  if (cmd === 'cat' || cmd === 'less') {
    for (const a of args) { if (opts && a === '--') { opts = false; continue; } if (!opts || !a.startsWith('-')) operands.push(a); }
  } else if (cmd === 'head' || cmd === 'tail') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (opts && a === '--') { opts = false; continue; }
      if (!opts || !a.startsWith('-')) { operands.push(a); continue; }
      let m;
      if (a === '-n' || a === '-c' || a === '--lines' || a === '--bytes') { if (COUNT.test(args[i + 1] || '')) ranged = true; i++; }
      else if ((m = a.match(/^(?:-n|-c|--lines=|--bytes=)(.*)$/))) { if (COUNT.test(m[1])) ranged = true; }
      else if (/^-\d+$/.test(a)) ranged = true;
    }
  } else {
    const quiet = args.some((a) => (/^-[^-]/.test(a) && a.includes('n')) || a === '--quiet' || a === '--silent');
    if (!quiet) return [];
    if (args.some((a) => a === '--in-place' || /^-[A-Za-z]*i/.test(a))) return [];
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
    ranged = !fscript && scripts.length > 0 && scripts.every((sc) => sc.split(/[;\n]/).filter((p) => p.trim()).every((p) => RANGE_PART.test(p)));
  }
  return ranged ? [] : [...operands, ...stdinOps];
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
      if (typeof ti.file_path === 'string' && none(ti.offset) && none(ti.limit) && none(ti.pages)) {
        const big = largeFile(ti.file_path, cwd, T);
        if (big) deny(reason(ti.file_path, big, T));
      }
    } else {
      for (const seg of parse(stripHeredocs(String(ti.command || '')))) {
        for (const op of unrangedOperands(seg)) {
          const big = largeFile(op, cwd, T);
          if (big) deny(reason(op, big, T));
        }
      }
    }
  }
} catch { /* fail open */ }
process.exit(0);
