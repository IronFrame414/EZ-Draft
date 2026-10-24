# 15g · Settings: Code edition

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Set the default code edition for new projects; each project also has its own code edition setting.

**Entry points:** Settings nav "Code edition".

**Permissions:** Manage users and settings. Section hidden without it.

**Layout:** Settings shell. Main card: default edition select, available rule sets, electrical options.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Default code edition select | Main | Sets tenant.code\_edition for new projects. v1 option: FBC 9th ed. (2026) with NEC 2023. | Plan: FBC 9th Edition effective Dec 31, 2026, adopts 2023 NEC. |
| Available editions list | Main | Display of supported rule sets. | v1: one. |
| Optional load-calc method (switch, default for new projects) | Main | Allows the NEC 220 optional method for existing dwellings alongside the standard method. | Round 24 #38: a toggle; per project on Electrical. |
| Save | Footer | Saves defaults. | Existing projects keep their own edition. |

**Data shown:** tenant.code\_edition and electrical defaults.

**States:** loading, error, offline read-only.

**Validation & warnings:** Note on page: "Changing the default does not change existing projects."

**Events emitted:** tenant.code\_edition\_updated (new).

**Decisions:**

1. v1 ships FBC 9th ed. / NEC 2023 only; other editions are added as rule sets later (Claude).
2. The per-project edition is edited in project settings and shown in the title block and on the Electrical screen (Claude).
