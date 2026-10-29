#!/bin/zsh
# Runs ledger-edits-2.mjs in a gap between launcher units; commits only when every step and the ledger check pass.
set -e
cd /Users/josh/Projects/ezdraft
H=vault/handoff
F=(vault/tickets/STATUS.md vault/tickets/tickets.json vault/tickets/phases/phase-01.md vault/spec/acceptance-criteria.md vault/questions/QUESTIONS.md vault/questions/QUESTIONS-answered.md vault/spec/decisions/process.md)
trap 'echo FAILED at line $LINENO' ERR
node $H/ledger-edits-2.mjs
node vault/tools/gen_acs.mjs >/dev/null
node vault/tools/next_ticket.mjs --check
rm $H/ledger-edits-2.mjs $H/ledger-edits-2.sh
git commit -q -m "docs(vault): Josh answers Q-0429 (a), Q-0428 (a); EZD-172 and EZD-259 ready; fix ticket EZD-266 (K7)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $F
git log --oneline -1
node vault/tools/next_ticket.mjs --next-unit
