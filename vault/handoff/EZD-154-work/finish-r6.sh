#!/bin/zsh
# Re-run 6 plan commit (Q-0418 (a)): finish-r6.sh <V1 sha> <accepted over-blocks text>. Run from the repo root.
set -e
W=vault/handoff/EZD-154-work
V1="$1"
ACC="$2"
node -e '
const fs=require("fs");const f=process.argv[1];let s=fs.readFileSync(f,"utf8");
for (const [a,b] of [["<V1>",process.argv[2]],["<ACCEPTED>",process.argv[3]]]) { if(s.split(a).length!==2) throw a; s=s.replace(a,()=>b); }
fs.writeFileSync(f,s);' $W/plan-r6-section.md "$V1" "$ACC"
node $W/plan-r6.mjs vault/plans/EZD-154.md
node $W/kl-r6.mjs vault/KNOWN-LIMITS.md
rm $W/block-b6.txt $W/plan-r6.mjs $W/plan-r6-section.md $W/plan-r6-samples.md $W/plan-r6-counts.json $W/kl-r6.mjs $W/gen-samples-md.mjs
git add $W/build-b6.mjs $W/b6-a.txt $W/b6-b.txt $W/samples-b6.mjs $W/replay-b6.mjs
git commit -q -m "docs(vault): EZD-154 Re-run 6 planned (Q-0418 (a)): Block B6, Samples B6, KNOWN-LIMITS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- vault/plans/EZD-154.md vault/KNOWN-LIMITS.md $W/build-b6.mjs $W/b6-a.txt $W/b6-b.txt $W/samples-b6.mjs $W/replay-b6.mjs
git log --oneline -1
