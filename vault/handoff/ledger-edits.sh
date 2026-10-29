#!/bin/zsh
# Orchestrator ledger edits of 2026-10-29 (Q-0427 (a); EZD-260 to EZD-262 back to todo; fix ticket EZD-265), run in a gap
# between launcher units. Commits only when every step and the ledger check pass; on a failure it stops with the files as
# they are and prints FAILED. One-off; deleted by its own commit.
set -e
cd /Users/josh/Projects/ezdraft
H=vault/handoff
F=(vault/tickets/STATUS.md vault/tickets/tickets.json vault/tickets/phases/phase-01.md vault/spec/acceptance-criteria.md vault/questions/QUESTIONS.md vault/questions/QUESTIONS-answered.md vault/spec/decisions/process.md)
trap 'echo FAILED at line $LINENO' ERR
node $H/q0427-record.mjs
node $H/todo-260-262.mjs
node $H/add-ezd-265.mjs
node vault/tools/gen_acs.mjs >/dev/null
node vault/tools/next_ticket.mjs --check
git rm -q $H/q0427-record.mjs $H/todo-260-262.mjs $H/add-ezd-265.mjs $H/ledger-edits.sh
git commit -q -m "docs(vault): Josh answers Q-0427 (a); EZD-260, EZD-261, EZD-262 back to todo (ready with no plan); fix ticket EZD-265

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $F $H/q0427-record.mjs $H/todo-260-262.mjs $H/add-ezd-265.mjs $H/ledger-edits.sh
git log --oneline -1
node vault/tools/next_ticket.mjs --next-unit
