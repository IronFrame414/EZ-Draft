// Secret files for guard-reads.mjs (EZD-279; Q-0459 (b)): .env files (not .env.example), scripts/launcher.config.json and the Claude sign-in file, in folded case on every disk (pathKey(p, true)); glob name parts match as typed, case-insensitively. Grep and Glob are judged on folder and pattern (ripgrep -g overrides .gitignore; plan EZD-279 section 2); a Grep outside the main checkout and its ticket worktrees is refused (Q-0462 (a)).
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
    if (T.match('.env') || prefixHit(T.toks, '.env.', '.env.example')) return 'env';
    if (T.match('launcher.config.json') && ((ctx.repoRoot !== null && at(`${ctx.repoRoot}/scripts`)) || lastSeg(dir) === 'scripts')) return 'launcher';
    if ((T.match('.credentials.json') || prefixHit(T.toks, '.cred')) && (at(`${ctx.home}/.claude`) || lastSeg(dir) === '.claude')) return 'signin';
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
