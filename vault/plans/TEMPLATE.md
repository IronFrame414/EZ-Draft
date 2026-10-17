# EZD-xxx · <ticket title>

Phase: N · Planned by: planner · Date: YYYY-MM-DD · Status: planned | questions

## Ticket (copied from the phase file)
Scope:
Done when:
Depends on:
Spec ref:

## Sources read
- Spec: `vault/spec/sections/...` (section names)
- Decisions: R24 #n, R26 Rn, Q-nnnn
- Mockup: `vault/mockups/Snn....png` (or "none — built from spec text, rule 6")

## Approach
What gets built, in steps. Data flow. Which existing modules it extends.

## Files
| Path | New / change | Why |
| --- | --- | --- |

## Data
Tables, columns, migrations, RLS policies, schema_version changes. Money fields: which permission reads them.

## Interface contract
What tests and code are both written to. Dependents must match it.
| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |
| --- | --- | --- |

## Tests (written by test-author before any code)
Every expected value has a source (spec table, decision, Q-ID, hand calculation Josh verified, reference document). No source → open question.
| Test | Type (unit / browser / perf) | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |

## Visual checklist
Only when a screen changes; otherwise "None". A plan with rows here depends on EZD-016a.
| Element | State (empty / loading / error / filled) | Mockup |
| --- | --- | --- |

## Proposed wording
User-visible text this ticket adds that is not on the mockup (errors, validation, empty states, toasts, labels on unmocked states). Josh approves at Stage 2. None → "None".
| Where | Text |
| --- | --- |

## Security review
security-review: yes | no
Areas (when yes): auth · permissions · data access · money · API

## Dependencies
From the ticket row, plus any it missed (say so).

## Reviewers needed
code-reviewer always · calc-auditor yes/no · ui-verifier yes/no (yes when there is a visual checklist) · security-reviewer yes/no (matches the Security review line)

## Risks
What could break other tickets or performance budgets.

## Open questions (QP-n)
QP-1 … written by the planner, one sentence each with the options. The orchestrator replaces them with Q-nnnn once logged in QUESTIONS.md. None → "None".
