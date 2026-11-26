# Performance audit 2026-11-26 (input for EZD-1994 to EZD-2000)

A Fable agent audited first-page-load size and loading on a copy of develop (a75f58fd). Its five changes are on the local and origin branch `audit/perf-2026-11-26` (commits 395f570d, 3d1e67cd, d823fc66, 4bcb601c, 7280c745). Sizes are from the build's own file lists, gzip level 6 as in scripts/perf/budgets.mjs. Josh decision Q-0814: build every fix and enforce the rules from then on.

Checks the audit ran: typecheck, lint, conventions C1-C11, production build, and 3,659 unit tests that need no database. Checks it did not run: database tests, e2e, the full gate, and the browser perf measurement. EZD-1994 runs them.

| # | Finding | Where | Measured | Ticket |
| --- | --- | --- | --- | --- |
| F1 | Every office and editor page inlines the whole English office catalog | `catalogFor('office','en')` in `app/src/app/(office)/page.tsx`, `(editor)/projects/[id]/page.tsx`, `server/settings/settings-root.tsx` | 2,918 messages, 166,631 bytes, 39,957 gzip per page view | EZD-1995 |
| F2 | One merged CSS file reaches every page, including sign-in | bundler default (`1r04j-pv-89pm.css`) | 121,952 bytes; sign-in CSS 20,313 gzip. Trial `experimental.cssChunking: 'graph'`: sign-in 4,698, Projects 14,185, editor 12,862 gzip, but 3-10 CSS files per page and 351 order changes | EZD-1996 |
| F3 | Projects page pulled zod for property record constants | `app/src/lib/property-record/property-record.ts` | 74,243 bytes, 20,988 gzip; fixed on the branch: Projects JS 268,631 -> 247,572 gzip | EZD-1994 |
| F4 | Server pages await independent reads one after another | editor (3), field pack (3), field measure (4), Projects (2) | not timed; fixed on the branch with tests | EZD-1994 |
| F5 | Three.js is most of the editor | `app/src/editor/plan/*` | 540,749 minified, 146,027 gzip over two chunks | none (no safe change) |
| F6 | Realtime library loads before Projects is interactive | `components/notifications/NotificationBell.tsx` | 62,684 bytes, 18,482 gzip | EZD-1997 |
| F7 | Field measure is over the 200 KB field budget; the gate measures the `/dev/entry/field` placeholder | `(field)/projects/[id]/field-measure/page.tsx`, `scripts/perf/perf.config.mjs` | 223,149 gzip | EZD-1998 |
| F8 | Icon path data inlined in every page | `components/icon/IconSprite.tsx` | 102 icons, 39,479 bytes, 13,064 gzip | none (Josh decision D-088) |
| F9 | Error reporting on every page | `src/instrumentation-client.ts` | 71,341 minified | none (trimmed by EZD-341) |
| F10 | New project wizard loads with Projects | `components/projects/NewProjectDialog.tsx` | about 45 KB minified (estimate) | EZD-1999 |

Uncompressed assets: none material (fonts woff2, icon PNGs under 7 KB, the image encoder loads only in a worker, Vercel compresses JS and CSS). Link prefetch is already off, the captcha script is async, the service worker registers after load.

Rules (EZD-2000): every route budgeted and measured at its real page; heavy libraries out of first loads; independent server reads start together; per-page messages; compressed assets; budgets never raised to pass.
