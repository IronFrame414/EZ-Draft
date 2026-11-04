// Re-run 6 KNOWN-LIMITS edit (Q-0418 (a)): node kl-r6.mjs <vault/KNOWN-LIMITS.md>. Extends the shell-guard entry (line 19).
import fs from 'node:fs';
const file = process.argv[2];
let s = fs.readFileSync(file, 'utf8');
const a = 'or a path built after a `cd` into the folder (`cd ~/.claude; cat .c*`; Q-0366 (b), Oct 28, 2026).';
const b = 'or a path built after a `cd` into the folder (`cd ~/.claude; cat .c*`; Q-0366 (b), Oct 28, 2026), a path held in plain variables (`cat $D/.c*`, `ln -s $D x`), or a link to the folder made by a program other than `ln` (`node -e`, `python3 -c`, `cp -s`; Q-0418 (a), Oct 29, 2026).';
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, () => b);
fs.writeFileSync(file, s);
