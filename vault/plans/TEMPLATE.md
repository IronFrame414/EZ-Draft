# EZD-xxx · <ticket title>

- **ACs:** AC-EZD-xxx-1, AC-EZD-xxx-2 … (from `vault/spec/acceptance-criteria.md`; one per testable sentence of the ticket's Done-when until the phase has Stage 0 ACs)
- **Complexity:** low | medium | high (PROCESS.md section 4; one sentence of reasoning in section 8 below)
- **User-visible result:** one line, plain words: what now works for Josh.
- Phase: N · Planned by: planner · Date: YYYY-MM-DD · Status: planned | questions

## 1. What to build
What changes, in steps, and the files it touches (table: Path | New / change | Why). Data: tables, columns, migrations, RLS policies, `schema_version` changes; money fields and which permission reads them.

Ticket row, copied from the phase file: Scope / Done when / Depends on / Spec ref.

## 2. Sources
Spec sections (`vault/spec/sections/...` with headings), decision IDs (R24 #n, R26 Rn, Q-nnnn, with the decisions file), and the mockup (`vault/mockups/Snn….png` + HTML). Every statement in section 1 cites one of these. Research reports R-NNN the plan drew on; a ticket no report covers says so.

## 3. Interface contract
What tests and code are both written to. Dependents must match it.
| Kind (file / export / signature / route / props / data-testid) | Name or path | Details |
| --- | --- | --- |

## 4. Tests
Written by test-author before any code. Every expected value has a source; no source → open question.
| Test | AC | Type (unit / browser / perf) | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |

## 5. Visual checklist
Only when a screen changes; otherwise "None". Name the one viewport (desktop 1600 × 1000, iPad landscape 1180 × 820, or phone). A plan with rows here depends on EZD-016a.
| Element | State (empty / loading / error / filled / no permission) | Mockup |
| --- | --- | --- |

## 6. Proposed wording
User-visible text this ticket adds that is not on the mockup (errors, validation, empty states, toasts, labels on unmocked states). Josh approves at Stage 2. None → "None".
| Where | Text |
| --- | --- |

## 7. Security review
security-review: yes | no. When yes: the areas touched (auth · permissions · data access · money · API · migrations).
Reviewers needed: code-reviewer always · calc-auditor yes/no · ui-verifier yes/no (yes when section 5 has rows) · security-reviewer yes/no (matches the line above).

## 8. Complexity and model recommendation
Rating, one sentence of reasoning, and the suggested test-author and builder models (PROCESS.md section 4).

## 9. Dependencies
From the ticket row, plus any it missed (say so). Risks: what could break other tickets or performance budgets.

## 10. Open questions
QP-1, QP-2 … one sentence each with the options. Only the orchestrator turns these into Q-IDs. None → "None".
