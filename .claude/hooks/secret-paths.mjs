// Secret files for guard-reads.mjs (EZD-279; Q-0459 (b)): .env files (not .env.example), scripts/launcher.config.json and the Claude sign-in file, in folded case on every disk (pathKey(p, true)); glob name parts match as typed, case-insensitively. Grep and Glob are judged on folder and pattern (ripgrep -g overrides .gitignore; plan EZD-279 section 2); a Grep outside the main checkout and its ticket worktrees is refused (Q-0462 (a)).
// Shell commands are judged word by word on the same rules (shellSecretReason, EZD-280; Q-0461 (a)).
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { norm, pathKey, repoRoot } from './lib.mjs';

const fold = (p) => pathKey(norm(p), true);
const realOr = (p) => { try { return norm(realpathSync.native(p)); } catch { return norm(p); } };

// The lexical target, plus the real one when links make it differ (the raw join lets the OS resolve `..` after links).
function targets(given, cwd, home) {
  let g = norm(given);
  if (g === '~') g = home;
  else if (g.startsWith('~/')) g = home + g.slice(1);
  const lexical = norm(path.resolve(norm(cwd), g));
  const raw = path.isAbsolute(g) ? g : `${norm(cwd)}/${g}`;
  let real = null;
  try { real = norm(realpathSync.native(raw)); } catch {}
  return real !== null && real !== lexical ? [lexical, real] : [lexical];
}

// dir is target or an ancestor of it, in folded case.
function under(dir, target) {
  const a = fold(dir).replace(/\/+$/, '');
  const t = fold(target);
  return a === '' || t === a || t.startsWith(`${a}/`);
}
const lastSeg = (p) => fold(p).split('/').filter(Boolean).at(-1) ?? '';

// Pieces of a Grep glob or Glob pattern: split at whitespace and at commas outside braces.
function pieces(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') depth++;
    if (ch === '}') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) || (ch === ',' && depth === 0)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const kindText = { env: 'a .env file', launcher: 'scripts/launcher.config.json', signin: 'the Claude sign-in file' };

// The main checkout: ticket worktrees sit under it at <main>/.claude/worktrees/<T>.
function mainRoot(rr) {
  if (rr === null) return null;
  const m = /^(.+)\/\.claude\/worktrees\/[^/]+$/i.exec(rr);
  return m ? m[1] : rr;
}

// S: which secret a path is, or null.
export function secretName(abs) {
  const segs = fold(abs).split('/').filter(Boolean);
  const b = segs.at(-1) ?? '';
  const p = segs.at(-2) ?? '';
  if (b === '.env' || (b.startsWith('.env.') && b !== '.env.example')) return 'env';
  if (p === 'scripts' && b === 'launcher.config.json') return 'launcher';
  if (b === '.credentials.json' || (p === '.claude' && b.startsWith('.cred'))) return 'signin';
  return null;
}

// P2: brace expansion of the first depth-0 group, recursively; null when unbalanced or over 64 results.
function braces(g) {
  let depth = 0;
  for (const ch of g) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) return null; }
  }
  if (depth !== 0) return null;
  const out = [];
  const walk = (s) => {
    if (out.length > 64) return;
    const open = s.indexOf('{');
    if (open < 0) { out.push(s); return; }
    let d = 0;
    let close = -1;
    const commas = [];
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') d++;
      else if (s[i] === '}') { d--; if (d === 0) { close = i; break; } }
      else if (s[i] === ',' && d === 1) commas.push(i);
    }
    const pre = s.slice(0, open);
    const post = s.slice(close + 1);
    const cuts = [open, ...commas, close];
    for (let k = 0; k < cuts.length - 1; k++) walk(pre + s.slice(cuts[k] + 1, cuts[k + 1]) + post);
  };
  walk(g);
  return out.length > 64 ? null : out;
}

// P5: the tokens and whole-name matcher of one name part, as typed and case-insensitive; null when a class is unclosed
// or a RegExp cannot be built (a reversed range such as [z-a]).
function compile(F) {
  const toks = [];
  for (let i = 0; i < F.length; i++) {
    const ch = F[i];
    if (ch === '*') { while (F[i + 1] === '*') i++; toks.push({ star: true }); continue; }
    if (ch === '?') { toks.push({ src: '[^/]' }); continue; }
    if (ch === '[') {
      let j = i + 1;
      let cls = '';
      if (F[j] === '!' || F[j] === '^') { cls += '^'; j++; }
      if (F[j] === ']') { cls += '\\]'; j++; }
      let closed = false;
      for (; j < F.length; j++) {
        const c = F[j];
        if (c === ']') { closed = true; break; }
        cls += /[\\[\]^]/.test(c) ? `\\${c}` : c;
      }
      if (!closed) return null;
      toks.push({ src: `[${cls}]` });
      i = j;
      continue;
    }
    toks.push({ src: ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), lit: true });
  }
  try {
    for (const tk of toks) {
      if (tk.star) continue;
      const cs = new RegExp(`^(?:${tk.src})$`, 'u');
      const ci = new RegExp(`^(?:${tk.src})$`, 'iu');
      // A character as typed, in either case, or under case folding: ignoring case alone would narrow a negated class
      // ([!E] refusing e) while ripgrep matches case-sensitively.
      tk.accept = (c) => cs.test(c) || cs.test(c.toLowerCase()) || cs.test(c.toUpperCase()) || ci.test(c);
    }
  } catch { return null; }
  return { toks, match: (name) => walk(toks, name) };
}

// The token positions reachable after consuming text from the start set S (a star takes any run of non-/ characters).
function closeStars(T, S) {
  const out = new Set(S);
  for (let changed = true; changed;) {
    changed = false;
    for (const i of out) if (T[i]?.star && !out.has(i + 1)) { out.add(i + 1); changed = true; }
  }
  return out;
}
function step(T, S, text) {
  for (const c of text) {
    const next = [];
    for (const i of S) {
      if (T[i]?.star) { if (c !== '/') next.push(i); } else if (i < T.length && T[i].accept(c)) next.push(i + 1);
    }
    S = closeStars(T, next);
    if (!S.size) break;
  }
  return S;
}
// P5: the whole name matches when the walk over it can end past the last token.
const walk = (T, name) => step(T, closeStars(T, [0]), name).has(T.length);

// P5a: whether the matcher accepts some name starting with pre (any case) that is not except (any case).
function prefixHit(T, pre, except) {
  const S = step(T, closeStars(T, [0]), pre);
  if (!S.size) return false;
  for (const i of S) if (T.slice(i).some((tk) => tk.star)) return true;
  for (const i of S) {
    const R = T.slice(i);
    if (except === undefined || R.length !== except.length - pre.length) return true;
    if (R.some((tk, j) => !tk.lit || !tk.accept(except[pre.length + j]))) return true;
  }
  return false;
}

// P: which secret a glob can reach from root, 'unreadable' when it cannot be judged, or null. No file system access.
export function globReach(root, glob, ctx) {
  const g = glob.trim();
  if (g === '' || g.startsWith('!')) return null;
  const alts = braces(g);
  if (alts === null) return 'unreadable';
  for (const a0 of alts) {
    let a = a0;
    let base;
    if (ctx.tool === 'Grep') { a = a.replace(/^\/+/, ''); base = root; } else base = a.startsWith('/') ? '/' : root;
    const segs = a.split('/');
    let F = segs.at(-1);
    const D = segs.slice(0, -1).filter((s) => s !== '');
    const wild = (s) => /[*?[\]{}!]/.test(s);
    const firstWild = D.findIndex(wild);
    const lit = firstWild < 0 ? D : D.slice(0, firstWild);
    const dir = norm(path.posix.resolve(base, ...lit));
    const deep = ctx.tool === 'Grep' || D.some(wild);
    if (F === '' || F === '**') F = '*';
    // P4: parts ripgrep reads differently than this judge does.
    const ext = (s) => s.includes('\\') || ['@(', '!(', '+(', '*(', '?('].some((x) => s.includes(x));
    if ([...D, F].some(ext)) return 'unreadable';
    if (D.some((s) => compile(s) === null)) return 'unreadable';
    const T = compile(F);
    if (T === null) return 'unreadable';
    const at = (target) => (deep ? under(dir, target) : fold(dir) === fold(target));
    const dot = ctx.tool !== 'Bash' || F.startsWith('.');
    if (dot && (T.match('.env') || prefixHit(T.toks, '.env.', '.env.example'))) return 'env';
    if (T.match('launcher.config.json') && ((ctx.repoRoot !== null && at(`${ctx.repoRoot}/scripts`)) || lastSeg(dir) === 'scripts')) return 'launcher';
    if (dot && ((T.match('.credentials.json') || prefixHit(T.toks, '.cred')) && (at(`${ctx.home}/.claude`) || lastSeg(dir) === '.claude'))) return 'signin';
  }
  return null;
}

const W1 = (given, k) => `Reading secret files is not allowed: ${given} is ${kindText[k]} (Q-0459).`;
const W2 = (tool, k) => `Searching secret files is not allowed: this ${tool} can reach ${kindText[k]} (Q-0459). Search a folder or a pattern that cannot match it.`;
const W3 = (tool, q) => `Searching secret files is not allowed: this ${tool} pattern cannot be checked: ${q} (Q-0459). Use a pattern without backslashes, extended globs or unbalanced brackets or braces.`;
const W5 = (where) => `Searching outside the repository is not allowed: this Grep searches ${where} (Q-0462). Search a folder inside the repository or a ticket worktree.`;

// H: the deny reason for a Read, Grep or Glob that names or can reach a secret file, else null.
export function secretReason(tool, ti, cwd) {
  const home = realOr(os.homedir());
  const rr = repoRoot();
  const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
  if (tool === 'Read') {
    const f = str(ti.file_path);
    if (f === null) return null;
    for (const t of targets(f, cwd, home)) { const k = secretName(t); if (k) return W1(f, k); }
    return null;
  }
  if (tool !== 'Grep' && tool !== 'Glob') return null;
  const p = str(ti.path);
  const bases = p ? targets(p, cwd, home) : [...new Set([norm(cwd), realOr(cwd)])];
  for (const t of bases) { const k = secretName(t); if (k) return W2(tool, k); }
  const judge = (text) => {
    for (const q of pieces(text)) {
      for (const t of bases) {
        const r = globReach(t, q, { tool, home, repoRoot: rr });
        if (r === 'unreadable') return W3(tool, q);
        if (r) return W2(tool, r);
      }
    }
    return null;
  };
  if (tool === 'Grep') {
    for (const t of bases) if (under(t, `${home}/.claude`)) return W2('Grep', 'signin');
    const main = mainRoot(rr);
    if (main === null || !under(main, bases.at(-1))) return W5(p ?? norm(cwd));
    const glob = str(ti.glob);
    return glob === null ? null : judge(glob);
  }
  const pat = str(ti.pattern);
  return pat === null ? null : judge(pat);
}

// K: the words of a shell command line, POSIX quoting (EZD-280; KNOWN-LIMITS shell-guard entry): a list of commands, each a
// list of words { text (after quote removal), glob (an unquoted *, ?, [ or {), unreadable ($'…' number or control escapes) }.
const CTRL = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
export function shellWords(command) {
  const s = String(command);
  const out = [];
  let cmd = [];
  const fresh = () => ({ text: '', glob: false, unreadable: false });
  let w = fresh();
  // K1
  const endWord = () => {
    if (w.text !== '') { if (['[', '[[', '{', '}', '{}'].includes(w.text)) w.glob = false; cmd.push(w); }
    w = fresh();
  };
  const endCmd = () => { endWord(); if (cmd.length) out.push(cmd); cmd = []; };
  let i = 0;
  // K5: inside "…", from after the opening quote; no closing quote runs to the end.
  const dq = () => {
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < s.length) {
        const n = s[i + 1];
        if ('$`"\\'.includes(n)) w.text += n;
        else if (n !== '\n') w.text += `\\${n}`;
        i += 2;
        continue;
      }
      w.text += s[i];
      i += 1;
    }
    i += 1;
  };
  // K6: inside $'…', from after the opening quote.
  const ansi = () => {
    while (i < s.length && s[i] !== "'") {
      if (s[i] === '\\' && i + 1 < s.length) {
        const n = s[i + 1];
        if ('\\\'"?'.includes(n)) w.text += n;
        else if (Object.hasOwn(CTRL, n)) w.text += CTRL[n];
        else if (/[0-9xuUc]/.test(n)) { w.unreadable = true; w.text += `\\${n}`; }
        else w.text += `\\${n}`;
        i += 2;
        continue;
      }
      w.text += s[i];
      i += 1;
    }
    i += 1;
  };
  let afterDollar = false;
  while (i < s.length) {
    const c = s[i];
    const wasDollar = afterDollar;
    afterDollar = false;
    // K2
    if (c === ' ' || c === '\t') { endWord(); i += 1; continue; }
    if (';&|()<>`\n\r'.includes(c)) { endCmd(); i += 1; continue; }
    // K3
    if (c === '\\') {
      if (s[i + 1] === '\n') i += 2;
      else if (i + 1 < s.length) { w.text += s[i + 1]; i += 2; }
      else { w.text += '\\'; i += 1; }
      continue;
    }
    // K4
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      const end = j < 0 ? s.length : j;
      w.text += s.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (c === '"') { i += 1; dq(); continue; }
    // K6
    if (c === '$' && s[i + 1] === "'") { i += 2; ansi(); continue; }
    if (c === '$' && s[i + 1] === '"') { i += 2; dq(); continue; }
    // K7
    if ('*?['.includes(c) || (c === '{' && !wasDollar)) w.glob = true;
    w.text += c;
    if (c === '$') afterDollar = true;
    i += 1;
  }
  // K8
  endCmd();
  return out;
}

const B1 = (shown, k) => `Naming secret files in a shell command is not allowed: ${shown} is ${kindText[k]} (Q-0461).`;
const B2 = (shown) => `Naming secret files in a shell command is not allowed: this word cannot be checked: ${shown} (Q-0461). Write it without $'…' number escapes or unbalanced brackets or braces.`;
const B3 = (shown, k) => `Naming secret files in a shell command is not allowed: ${shown} can match ${kindText[k]} (Q-0461). Name the files without wildcards or braces.`;
const REREAD = /[\s'"\\`$;&|<>()]/;

// J: the deny reason for a shell command that names or can reach a secret file, else null (EZD-280; Q-0461 (a)).
export function shellSecretReason(command, cwd) {
  const home = realOr(os.homedir());
  const rr = repoRoot();
  const roots = [norm(cwd)];
  let cur = norm(cwd);
  let prev = cur;
  // J2
  function judgeWord(w, depth) {
    // Round 1 code-review note 1: a word holding `$` also splits at `{`, `}`, `+`, `-`, so a written default `${X:-.env.local}` is judged.
    const cands = [...new Set([w.text, ...w.text.split(w.text.includes('$') ? /[\s=:,{}+-]+/ : /[\s=:,]+/).filter((x) => x !== '')])];
    for (const s of cands) {
      for (const root of roots) for (const t of targets(s, root, home)) { const k = secretName(t); if (k) return B1(s, k); }
    }
    if (w.unreadable && depth === 0) return B2(w.text);
    if (w.glob) {
      let g = w.text;
      if (g === '~') g = home;
      else if (g.startsWith('~/')) g = home + g.slice(1);
      for (const root of roots) {
        const r = globReach(root, g, { tool: 'Bash', home, repoRoot: rr });
        if (r === 'unreadable') { if (depth === 0) return B2(w.text); } else if (r) return B3(w.text, r);
      }
    }
    if (REREAD.test(w.text)) {
      const again = shellWords(w.text);
      const same = again.length === 1 && again[0].length === 1 && again[0][0].text === w.text;
      if (!same) {
        if (depth >= 3) return B2(w.text);
        const r = walkShell(w.text, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  // J1, J3: roots and cur are shared by every level of this call.
  function walkShell(text, depth) {
    for (const c of shellWords(text)) {
      const t = c.map((x) => x.text);
      let exempt = null;
      if (t.length === 3 && t[0] === 'test' && t[1] === '-f') exempt = c[2];
      else if (t.length === 4 && t[0] === '[' && t[1] === '-f' && t[3] === ']') exempt = c[2];
      if (t[0] === 'cd' || t[0] === 'pushd') {
        const later = c.slice(1);
        const plain = later.filter((x) => !x.text.startsWith('-'));
        const a = plain.length ? plain.at(-1) : later.length === 1 && later[0].text === '-' ? later[0] : null;
        // Round 1 security finding 1: a wildcard folder cannot be checked (`cd ~/.[c]laude` reaches the sign-in folder).
        if (a !== null && a.glob) return B2(a.text);
        let next;
        if (a === null) next = home;
        else if (a.text === '-') next = prev;
        else if (/[$`]/.test(a.text)) next = cur;
        else next = targets(a.text, cur, home)[0];
        prev = cur;
        cur = next;
        if (!roots.includes(cur)) roots.push(cur);
      }
      for (const w of c) {
        if (w === exempt) continue;
        const r = judgeWord(w, depth);
        if (r) return r;
      }
    }
    // J4
    return null;
  }
  return walkShell(command, 0);
}
