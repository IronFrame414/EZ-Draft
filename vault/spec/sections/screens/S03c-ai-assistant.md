### 03c · AI assistant

Added by spec-check 4 (Q-0474, Josh 2026-11-04). What Josh settled for the assistant window. The boards (S03c, S01g), the tickets and this feature's full readiness check come at phase 5's spec check, before the phase is planned (decisions process.md, Q-0474).

**Purpose:** The user draws by hand and also types prompts that add or change things. The AI proposes a preview; the user accepts, adjusts or rejects it. Accepted changes are ordinary model changes, so Undo covers them (decisions 05-screens.md, 2026-10-31).

**Who sees it:** Users with Edit model. View-only users do not see the Assistant button. Using it needs the user's own Anthropic API key; EZ Draft holds no company key and never bills for it (decisions 10-permissions-and-settings.md, 2026-10-31).

**Layout:** The normal canvas stays. An Assistant button on the rail opens a panel on the right, in the inspector's place: the conversation, a prompt box at the bottom, and a model picker chosen per prompt, with Claude Sonnet 5.5 first and higher models such as Opus 5.5 offered. Under each reply, about what that prompt cost and the session total.

**Preview:**

| Drawing type | Preview | Actions |
| --- | --- | --- |
| Plan, electrical, plumbing, details | Additions highlighted blue, removals red dashed | Accept, Adjust (edit by hand first), Reject |
| Renders | The prompt changes the scene and shows before and after; the image still comes from Generate and its own credits | Accept, Adjust, Reject |

**Key, in My profile (new AI assistant section):** Paste a key; it is tested, encrypted, and from then on shown only as its last 4 characters; it is never sent to the browser. Remove deletes it. The storage design and per-call use are reviewed by the security-reviewer when the phase is planned, because they change the "AI only inside jobs" design in docs/architecture.md.

**States:**

- No key: the Assistant button opens a short note on adding a key, with a link to My profile. Drawing by hand is unchanged.
- Key refused or out of credit: a plain message, the prompt text stays in the box, the drawing is untouched, with a link to My profile.

**What goes to the AI:** The drawing's objects and measurements and the prompt. A photo only when the user attaches one to that prompt. Never client name, address, or any cost or price. Anthropic deletes API prompts and replies within 30 days, keeps flagged content up to 2 years, and does not use retained data for training without permission (privacy.claude.com, "How long do you store my organization's data"; platform.claude.com, "API and data retention"; read 2026-11-04).

**What EZ Draft keeps:** No prompts or replies after the session. A usage line: who, when, which model, what it cost. Accepted changes are marked as AI in the event log.

**Limits:** EZ Draft sets no spending limit on a user's own key.

**Scope:** The first phase covers walls, doors and windows; each later tool phase adds its own AI commands (decisions process.md, Q-0474).
