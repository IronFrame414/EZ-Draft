// Re-run 6 work copy builder (Q-0418 (a)): node build-b6.mjs <Re-run 5 guard-bash.mjs> <out>. Applies Block B6 as three
// exact replacements; each anchor must occur once.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
let s = fs.readFileSync(src, 'utf8');
const rep = (a, b) => {
  if (s.split(a).length !== 2) throw new Error(`anchor not found once: ${a.slice(0, 60)}`);
  s = s.replace(a, () => b);
};
const B6a = fs.readFileSync(new URL('./b6-a.txt', import.meta.url), 'utf8');
const B6b = fs.readFileSync(new URL('./b6-b.txt', import.meta.url), 'utf8');
// 1. $'…' spans are decoded before the path checks, so $'\x2e'claude is read as .claude.
rep("const stripped = unquote(raw\n", `${B6a}const stripped = unquote(plain\n`);
rep('const noTests = echoOnly ? stripped : unquote(raw);', 'const noTests = echoOnly ? stripped : unquote(plain);');
// 2. The Re-run 5 ln deny is replaced by the dot-globbing deny, the spelled-level deny and the per-segment ln deny.
const start = s.indexOf('// A link to ~/.claude lets');
const end = s.indexOf('const readOnly');
if (start < 0 || end < 0) throw new Error('ln anchor');
s = s.slice(0, start) + B6b + '\n' + s.slice(end);
fs.writeFileSync(out, s);
