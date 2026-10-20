# Decisions index

One file per spec area, mirroring `vault/spec/sections/`. A dispatch hands an agent only the files for the areas its plan cites. `13a`–`13c` are the spec's own decision rounds (read-only); the other files hold Josh's build-time answers (Q-IDs). Only the orchestrator appends here (hook-enforced). Tags: the Q-IDs each file holds.

| File | Holds | Q-IDs |
| --- | --- | --- |
| 13a-rounds-24-25.md | Spec decisions Round 24 and 25, by area: scope and hosting, sheets and issue, permissions and users, edit lock and versions, render, revisions and change orders, field, client, electrical, translations, values, performance and build method (P1–P6) | R24 #n, R25, P1–P6 |
| 13b-round-26.md | Round 26 build-readiness audit decisions R1–R34 (override Round 24 where they differ) | R26 R1–R34 |
| 13c-open-and-resolved.md | Items still open outside the software, and items resolved from the plan doc (Oct 11) | — |
| 02-product-overview.md | Product overview: stack, platform, hosting, accounts, devices | Q-0003 Q-0013 Q-0015 Q-0024 Q-0027 Q-0031 Q-0033 Q-0053 Q-0054 Q-0088 Q-0109 Q-0110 Q-0113 Q-0123 Q-0177 Q-0196 |
| 04-app-shell-and-global-ui.md | App shell and global UI: tokens, radii, header, states, shared wording | Q-0026 Q-0037 Q-0039 Q-0040 Q-0051 Q-0055 Q-0056 Q-0057 Q-0058 Q-0086 Q-0098 Q-0038 Q-0122 Q-0183 Q-0206 Q-0208 Q-0213 Q-0214 |
| 05-screens.md | Screens and mockups | Q-0034 — Q-0080 Q-0185 Q-0186 Q-0191 Q-0192 Q-0199 Q-0200 Q-0201 Q-0203 Q-0204 Q-0217 |
| 07-hooks-events-and-integrations.md | Hooks, events, jobs and outside services: email, jobs, EZ Binder, AI and render providers | Q-0035 Q-0036 Q-0041 Q-0059 Q-0067 Q-0068 Q-0077 Q-0078 Q-0081 Q-0016 Q-0076 Q-0082 Q-0083 Q-0084 Q-0190 |
| 08-import-and-export.md | Import and export: department submittals | Q-0017 Q-0189 Q-0193 Q-0209 Q-0215 |
| 09-calculations-and-rules.md | Calculations and code rules | Q-0001 Q-0179 Q-0180 Q-0181 Q-0182 Q-0205 Q-0207 |
| 10-permissions-and-settings.md | Permissions, users, sign-in and language | Q-0014 Q-0029 Q-0030 Q-0043 Q-0046 Q-0047 Q-0048 Q-0049 Q-0050 Q-0090 Q-0091 Q-0092 Q-0093 Q-0099 Q-0100 Q-0101 Q-0102 Q-0002 Q-0096 Q-0121 Q-0094 Q-0178 Q-0187 Q-0188 Q-0202 Q-0210 Q-0212 Q-0216 |
| 11-non-functional-requirements.md | Non-functional: performance targets, operations, releases, backups, error reporting, GPU | Q-0018 Q-0020 Q-0069 Q-0070 Q-0074 Q-0075 Q-0097 Q-0106 Q-0107 Q-0111 Q-0211 Q-0035 |
| process.md | Build process and repository (answers that shape how the build runs rather than the product) | Q-0004 Q-0006 Q-0011 Q-0171 Q-0019 Q-0025 Q-0032 Q-0065 Q-0108 Q-0114 Q-0116 Q-0117 Q-0118 Q-0119 Q-0124 Q-0125 Q-0129 Q-0138 Q-0184 Q-0194 Q-0195 |

Process-level answers recorded on Oct 18, 2026 (Q-0114 and later) are in `process.md`.
