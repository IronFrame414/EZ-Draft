# Phase 0 · Questions for Josh

Written Oct 11, 2026 (night run, unattended). Each question: what it is about, the options, and a recommendation first with the reason. Answer in any form ("Q-0030: a", "all recommended except Q-0047: a"); the orchestrator records your answers in `QUESTIONS.md` and `spec/decisions.md`. Full question text: `vault/questions/QUESTIONS.md`. Plans: `vault/plans/EZD-xxx.md`.

**Fastest path:** reply "all recommended" and name only the ones you want different. The first two unblock most of Phase 0.

## 1. Unblock the build first

**Q-0030 · Who writes the Spanish on crew screens** (EZD-026a; holds EZD-007, 011, 012, 014, 015, 026b and most of Phase 0)
Buttons, messages and errors on the field pack and crew phone screens need Spanish (decision R17). The in-app Translations queue covers only sheet notes, keynotes and field tasks.
- **(a) Recommended:** each ticket's builder writes the Spanish in the same commit; a Spanish-speaking crew member checks it at the field checks (and in Phase 15). No cost, no waiting.
- (b) Interface text also goes into the Translations queue for an approver.
- (c) You or a translator supply the Spanish before each ticket is built.

**Q-0086 · Wording of three error messages** (EZD-026a, EZD-004, EZD-009)
Users see these when something goes wrong.
- **(a) Recommended:** "Can't reach the database. Try again in a minute." / "You don't have permission to do that." / "That job no longer exists."
- (b) Your own wording.

**Q-0013 · Oldest browsers supported** (EZD-001) and **Q-0026 · colour fallback** (EZD-010)
- **(a) Recommended:** the framework default: Safari/iOS 16.4 or later (spring 2023) and Chrome/Edge 111+, Firefox 113+. Then Q-0026 is (a): no extra fallback colours needed.
- (b) Name older devices that must work (for example an older crew iPhone); colour fallbacks are then added.

**Q-0053 · Which iPad you use** (EZD-014, EZD-016a, EZD-027)
Sets the iPad screen size every test uses. Name the model (Settings → General → About). If unsure: **iPad Air 11-inch size, 1180 × 820** (recommended default).

## 2. Accounts and money

**Q-0024 · Where EZ Draft's Supabase projects are billed** (EZD-004). EZ Draft gets its own dev and prod projects either way (the spec forbids sharing EZ Binder's database).
- **(a) Recommended if EZ Binder's Supabase organization is already on Pro:** inside it; no new $25 plan, each project adds its compute charge.
- (b) A new organization on its own Pro plan ($25/month plus compute).
Please also say which plan EZ Binder's organization is on.

**Q-0031 · Where the Vercel project lives** (EZD-003, EZD-009)
- **(a) Recommended if EZ Binder's Vercel team is already on Pro:** inside that team. If it is on the free Hobby plan it must move to Pro (commercial use, once-a-minute jobs).
- (b) A new team on its own Pro plan (~$20/month).
Please also say which plan the team is on.

**Q-0027 · Function time and memory limits** (EZD-028, EZD-029, EZD-009)
- **(a) Recommended:** Vercel Pro defaults, 5 minutes and 2 GB per run, no extra cost.
- (b) Raised limits (up to ~13 minutes, 4 GB), costs more per run.
Needs your confirmation that the Vercel account is on Pro.

**Q-0035 · Which address EZ Draft sends email from** (EZD-008)
- **(a) Recommended for now:** EZ Binder's already-verified `ezcontractorbinder.com`. Works today, no cost; shares spam reputation with EZ Binder, fine at your volume. Move to its own subdomain later if needed.
- (b) A new verified subdomain `ezdraft.ezcontractorbinder.com` (three DNS records at Spaceship; may need a paid Resend plan if the shared account is on the free plan).
Please also say which Resend plan the account is on.

**Q-0036 · What people see as the email sender** (EZD-008)
- **(a) Recommended:** "Worth Properties via EZ Draft", with replies going to the person who sent it. Clients see your company.
- (b) "EZ Draft" from a no-reply address.
- (c) A name and address you give.

**Q-0070 · Sentry account for error reports** (EZD-024)
- **(a) Recommended:** a new free Sentry organization with one `ezdraft` project; turn off Sentry's own new-issue emails so each error emails you once (from the app).
- (b) As (a) but keep Sentry's emails too (duplicates).
- (c) Inside an organization EZ Binder uses, or a paid plan.

**Q-0074 · Off-site backup storage company** (EZD-025)
- **(a) Recommended:** Backblaze B2, about $6 per TB-month; at tens of GB this is well under $1/month. Keeps every version; keys can be no-delete.
- (b) Amazon S3, about $23 per TB-month plus request fees.
- (c) Wasabi, about $7 per TB-month but bills a 1 TB minimum.

**Q-0075 · How long off-site backups are kept** (EZD-025)
- **(a) Recommended:** weekly database backups for 13 weeks, replaced or deleted file versions for 90 days. Bounds cost and how long deleted clients' data stays off-site.
- (b) Keep everything until the Phase 17 cost check.
- (c) Your own periods.

**Q-0076 · Which accounts serve two image models** (EZD-021, EZD-031)
- **(a) Recommended:** Gemini through the Gemini API on a paid (billed) Google AI Studio key (the free tier lets Google use your images to improve its products); Flux Kontext pro through Black Forest Labs' own API.
- (b) Google Vertex AI and/or a reseller (fal.ai, Replicate).

**Q-0041 · Do test previews send real email?** and **Q-0077 · Do test previews call paid AI?** (EZD-023b, EZD-021)
- **(a) Recommended for both:** no. Previews use the built-in stand-ins, so nothing is emailed and nothing is spent. Supabase's own sign-in emails from the dev project still arrive.
- (b) Yes, with the production keys.

## 3. Sign-in and security

**Q-0046 · Sign-in page and email wording** (EZD-007)
- **(a) Recommended:** the planner's draft in `vault/plans/EZD-007.md`, Open questions.
- (b) Your own wording.

**Q-0047 · Language of the sign-in page and email** (EZD-007)
The app doesn't know who you are before you sign in.
- **(a) Recommended:** an English / Español switch on the page, remembered on the device; the email carries both languages, English first. Crews see Spanish from the first screen.
- (b) English only (simplest).
- (c) Both languages side by side always.

**Q-0048 · How long people stay signed in** (EZD-007)
- **(a) Recommended (security-reviewer agrees):** stay signed in until they sign out, are deactivated, or don't open the app for 400 days. A lost device is cut off by deactivating the person, which ends their sessions at once.
- (b) Phones and the installed app as (a); desktop browsers signed out after N days unused (you pick N; 30 suggested).

**Q-0049 · How long the emailed sign-in link and code last** (EZD-007)
- **(a) Recommended (security-reviewer):** 15 minutes. Makes guessing the 6-digit code four times harder; a late reader taps "send again".
- (b) 1 hour (Supabase's default).
- (c) 24 hours (not recommended).

**Q-0050 · Can someone with a pending invite sign in from the sign-in page?** (EZD-007, EZD-105)
- **(a) Recommended (security-reviewer):** yes, if the invite is still valid (7 days) and not cancelled; signing in accepts it. Covers invites lost to spam; it proves the same thing (they control the mailbox).
- (b) No; they must use the invite link first.

**Q-0043 · One person in two companies** (EZD-006, EZD-105)
- **(a) Recommended (security-reviewer):** one active company per person in v1; inviting someone already active in another company is refused. Only Worth Properties exists today.
- (b) Use the company they were most recently active in.
- (c) Build a company switcher now (new ticket).

**Q-0029 (restated) · Default language for a new user** (EZD-005, EZD-026b)
When the person inviting doesn't pick a language. EZD-005 currently defaults to English.
- **(a) Recommended:** English; the inviter or the user switches to Spanish in their settings.
- (b) Spanish.
- (c) Language becomes a required pick on every invite.

**Q-0065 · Real job files in a public repo** (EZD-016b)
Polycam scans of clients' homes, plans with names and addresses, photos with GPS.
- **(a) Recommended (security-reviewer):** real files never go into git; you copy them onto the build PC; a check fails if one is ever committed; tests say "real fixture not supplied" when missing.
- (b) Commit them after removing names, addresses and photo locations.
- (c) Commit them as-is (not recommended).
- (d) Make the repository private (GitHub Actions minutes then count against your plan).
Note: agents reading these files sends client data to the AI provider. Separately: the repository `IronFrame414/EZ-Draft` is public today, so the spec and code are readable by anyone. Making it private is your call (GitHub → Settings → General → Danger Zone).

**Q-0067 · Who gets error and failure alert emails** (EZD-024)
- **(a) Recommended (security-reviewer):** one alert address you set in Vercel; it gets everything. Alerts carry ids and codes only, no client data.
- (b) Also email each company's owners about their own failed jobs.

**Q-0068 · How many alert emails** (EZD-024)
- **(a) Recommended:** one per failed job or failed webhook delivery, and no more than 20 alert emails an hour in total.
- (b) Only the first failure of each kind per company.
- (c) Your own rule.

**Q-0069 · Alert email wording** (EZD-024)
- **(a) Recommended:** the planner's draft, `vault/plans/EZD-024.md` Approach Step 8.
- (b) Your own.

**Q-0059 · Retries when a background job fails** (EZD-009). Each retry of a paid render or AI call can cost again.
- **(a) Recommended:** up to 5 tries over about 15 minutes, then you get an alert; paid job kinds may set fewer in their own tickets.
- (b) Up to 3 tries over about 6 minutes.
- (c) Your own numbers.

## 4. Screens and look

**Q-0039 · What the live site shows signed-in users in Phase 0** (EZD-012, EZD-032; your Phase 0 field check)
- **(a) Recommended:** the home page shows the empty editor shell until Projects takes it over in Phase 1. Your field check on the desktop and iPad then shows the real shell.
- (b) A small new ticket does that page (same result, one more ticket).
- (c) Production shows only a signed-in page with Sign out; the shell is checked on a developer page.

**Q-0040 · Tooltip corner radius** (EZD-012) and **Q-0057 · Dialog corner radius** (EZD-015)
The approved mockups use 6 px (tooltips) and 14 px (dialogs); the spec's list of radii has neither.
- **(a) Recommended:** follow the mockups (6 px and 14 px) as approved exceptions.
- (b) Round to the spec's nearest values (5 or 7 px; 12 px).

**Q-0051 · App icon on the home screen** (EZD-013)
- **(a) Recommended:** a white lowercase "ez" on a solid cobalt square now; swap in your own artwork later if you want (send a square image at least 1024 px).
- (b) The full "ezdraft" wordmark on white (hard to read small).
- (c) Your artwork now.

**Q-0054 · Phone layout vs iPad held upright** (EZD-014)
- **(a) Recommended:** the full editor from 1024 px wide; below that (iPad upright, Split View, narrow windows) the simple phone layout.
- (b) Full editor on every iPad either way up (very cramped upright).
- (c) A "turn your iPad sideways" notice between 744 and 1024 px.

**Q-0055 · Header buttons that don't fit on the iPad** (EZD-014)
- **(a) Recommended:** on screens narrower than the desktop, Share, Export and Stop editing show only their icon (name in a tooltip and for screen readers).
- (b) Share and Export move into one "More" menu.
- (c) Hide the field-pack chip and presence avatars on iPad.
- (d) Decide later, per ticket.

**Q-0056 · What a phone shows if someone opens the editor** (EZD-014)
- **(a) Recommended:** "Editing is done on an iPad or a computer. Open this project there." (Spanish per Q-0030)
- (b) Your wording.
- (c) No text, only the project name.

**Q-0058 · How long a pop-up message stays** (EZD-015). For example "Link copied".
- **(a) Recommended:** 5 seconds; messages that need an answer stay until used or closed.
- (b) 8 seconds (more time on phones).
- (c) A company setting (from Phase 1).

## 5. EZ Binder connection (EZD-019; affects EZ Binder's side too)

**Q-0078 · One EZ Binder job with several EZ Draft projects** (for example kitchen and bath)
- **(a) Recommended:** EZ Binder keeps each EZ Draft project's id and opens that one; with only a job id, EZ Draft shows that job's projects.
- (b) One project per job only.
- (c) Open the most recently changed project.

**Q-0080 · Which version EZ Binder gets as "approved"**
- **(a) Recommended:** the version the client signed off (selection set approval locks it), with client-ready renders.
- (b) The latest version sent to anyone.
- (c) The latest permit issue.

**Q-0081 · Project type when EZ Binder creates a project**
- **(a) Recommended:** EZ Binder asks for the type (Kitchen, Bath or Whole-home) and sends it.
- (b) EZ Draft uses a default you name; the user changes it later.
- (c) Open EZ Draft's New project form prefilled from the job.

## 6. Render trial (EZD-031 — only for your live run; the build doesn't wait)

**Q-0082 · The 5 rooms and their starting images**
- **(a) Recommended:** 5 past jobs you pick; for each, the 3D view from the design software used (for kitchens, the supplier's 2020 rendering).
- (b) Polycam scan screenshots (shows the room before the work).
- (c) Site photos.
- (d) Both a 3D view and a site photo (double the renders and cost).

**Q-0083 · The instruction sent with each image**
- **(a) Recommended:** a fixed opening ("Turn this 3D view into a photograph of the finished room. Keep the room's shape and every cabinet, fixture, door and window exactly where they are and at the same size.") plus one or two sentences from you per room on finishes.
- (b) The fixed opening only.
- (c) You write each instruction.

**Q-0084 · Models and quality**
- **(a) Recommended:** each provider's default settings: 15 renders, lowest cost.
- (b) Also the top-quality settings: 30 renders, about twice the cost.
- (c) You name models and settings.

## 7. Older questions still waiting

**Q-0002 · Five decisions Claude made in Round 26 (R14, R17, R18, R21, R24)**
R21 (first image provider) is now settled by your render-trial answer (Q-0016). **Recommended: keep R14, R17, R18 and R24 as written.**

**Q-0020 · Phase 11's local render worker** (not needed until Phase 11)
With no GPU (Q-0018): **Recommended: drop the local worker from v1** and add it back if you ever buy a GPU machine. Alternative: still build the protocol now.

**Q-0037 (Phase 1) · Review-pill text colour:** **Recommended (b): the mockups' darker amber** (readable). **Q-0038 (Phase 2) · Tools that don't fit the rail:** can wait until Phase 2 planning.

## 8. Steps only you can do (no answer needed, just do them before the build)

1. **Apply the new `scripts/gate.mjs`** (Q-0006, your answer: phase tests plus a smoke set per ticket; also enforces one check at a time per Q-0019). Replace the whole file with the text in the block below. EZD-001's test T13 needs it.
2. **Optional, recommended:** in `.claude/skills/build-phase/SKILL.md` step 8, change "run the gate on develop" to `node scripts/gate.mjs . --phase <N>`, so the check after each merge runs only that phase's tests.
3. **Optional:** EZD-017 Step 9 has an `upload-artifact` step for `ci.yml` so CI keeps each speed-check result (`vault/plans/EZD-017.md`, Step 9).
4. **Optional, recommended (EZD-023b):** add deny rules for `pnpm release:*` and `node scripts/release/*` to `.claude/settings.json` and `guard-bash.mjs` so no agent can start a production release (`vault/plans/EZD-023b.md`).
5. **Before the build starts:** Docker Desktop running; approve the one-time browser install `pnpm exec playwright install chromium webkit`.
6. **Vercel:** do not turn on "Ignored Build Step" (SETUP.md mentions it); it would stop the develop and phase-PR previews.
7. **Later (runbooks written by the tickets):** Vercel project and DNS record at Spaceship (EZD-003); Supabase cloud projects (EZD-004); Resend domain (EZD-008); the database gate secret in each cloud project and Vercel (EZD-006, Q-0087); Sentry; backup bucket. Full list: `vault/tickets/needs-from-josh.md`.

### Replacement text for `scripts/gate.mjs` (from `vault/plans/EZD-001.md`, Step 6.4)

The changes against the current file:
- argument parsing (`[dir] [--phase N | --full] [--print-scope]`);
- scope selection;
- a one-at-a-time lock in the OS temp folder (Q-0019);
- scope variables in the environment of every step;
- the scope printed at the start and in the summary.

Everything else (the no-package rule, the install step, the check order, required checks, summary and exit codes) is unchanged.

```js
#!/usr/bin/env node
// The build gate. Usage: node scripts/gate.mjs [dir] [--phase N | --full] [--print-scope]
//   dir = repo root or a ticket worktree; default ".".
// Test scope (Q-0006): a ticket worktree (folder named EZD-xxx) runs the phase's tests plus the @smoke set;
// any other folder, or --full, runs the full suite (phase gate, CI). --phase N forces phase scope.
// Runners read EZD_TEST_SCOPE, EZD_PHASE and EZD_TEST_GREP (see docs/architecture.md, Test scope).
// Only one gate runs at a time on this machine (Q-0019).
// Exits 0 only if every check that exists passes. Same script runs locally, in review, and in CI.
import { existsSync, readFileSync, readdirSync, statSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const phaseIdx = args.indexOf('--phase');
const positional = args.filter((a, i) => !a.startsWith('--') && !(phaseIdx >= 0 && i === phaseIdx + 1));
const dir = path.resolve(positional[0] || '.');
const pkgPath = path.join(dir, 'package.json');
const shell = process.platform === 'win32';

function scopeFor() {
  if (args.includes('--full')) return { mode: 'full' };
  let phase;
  if (phaseIdx >= 0) {
    const v = args[phaseIdx + 1];
    if (!/^\d{1,2}$/.test(v || '')) { console.error(`GATE FAIL: --phase needs a phase number, got "${v || ''}".`); process.exit(1); }
    phase = Number(v);
  } else {
    const m = /^EZD-(\d{3,4})[a-z]?$/.exec(path.basename(dir));
    if (!m) return { mode: 'full' };
    phase = Math.floor(Number(m[1]) / 100);
  }
  return { mode: 'phase', phase, grep: `(?:EZD-${phase}\\d{2}[a-z]?(?![0-9]))|@smoke` };
}
const scope = scopeFor();
const scopeText = scope.mode === 'full' ? 'full suite' : `phase ${scope.phase} tests + @smoke`;

if (args.includes('--print-scope')) {
  console.log(JSON.stringify({ dir, ...scope }));
  process.exit(0);
}

const env = { ...process.env, CI: '1', EZD_TEST_SCOPE: scope.mode };
delete env.EZD_TEST_GREP; delete env.EZD_PHASE;
if (scope.mode === 'phase') { env.EZD_PHASE = String(scope.phase); env.EZD_TEST_GREP = scope.grep; }

// One gate at a time (Q-0019). A lock left by a dead process is taken over.
const lockPath = path.join(os.tmpdir(), 'ezdraft-gate.lock');
function takeLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0;
      try { pid = Number(readFileSync(lockPath, 'utf8')) || 0; } catch {}
      let alive = false;
      if (pid) { try { process.kill(pid, 0); alive = true; } catch (err) { alive = err.code === 'EPERM'; } }
      if (alive) { console.error(`GATE FAIL: another gate is running (pid ${pid}). Run one gate at a time (Q-0019).`); process.exit(1); }
      try { unlinkSync(lockPath); } catch {}
    }
  }
  console.error('GATE FAIL: could not take the gate lock.'); process.exit(1);
}
function releaseLock() {
  try { if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath); } catch {}
}
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

function hasTests(d, depth = 0) {
  if (depth > 6) return false;
  for (const name of readdirSync(d)) {
    if (['node_modules', '.git', '.next', 'vault', '.claude', 'spikes'].includes(name)) continue;
    const p = path.join(d, name);
    const st = statSync(p);
    if (st.isDirectory() ? hasTests(p, depth + 1) : /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return true;
  }
  return false;
}

if (!existsSync(pkgPath)) {
  if (hasTests(dir)) { console.error('GATE FAIL: test files exist but there is no package.json.'); process.exit(1); }
  console.log('GATE: no app yet (no package.json, no tests). Nothing to check.');
  process.exit(0);
}

takeLock();
console.log(`GATE: ${dir} · scope: ${scopeText}`);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};
const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) || pkg.packageManager?.startsWith('pnpm') ? 'pnpm' : 'npm';
const run = (cmdArgs, label) => {
  console.log(`\n=== ${label}: ${pm} ${cmdArgs.join(' ')} ===`);
  const r = spawnSync(pm, cmdArgs, { cwd: dir, stdio: 'inherit', shell, env });
  return r.status === 0;
};

if (!existsSync(path.join(dir, 'node_modules'))) {
  if (!run(pm === 'pnpm' ? ['install', '--frozen-lockfile'] : ['ci'], 'install')) { console.error('GATE FAIL: install'); process.exit(1); }
}

// Order matters: cheap checks first. "test:e2e" and "perf" join once EZD-016 / EZD-017 add them.
const checks = ['typecheck', 'lint', 'test', 'build', 'test:e2e', 'perf'];
const required = ['typecheck', 'lint', 'test', 'build'];
const results = [];
for (const name of checks) {
  if (!scripts[name]) { results.push([name, required.includes(name) ? 'MISSING' : 'not yet']); continue; }
  results.push([name, run(['run', name], name) ? 'pass' : 'FAIL']);
}

console.log('\n=== GATE SUMMARY ===');
console.log(`scope      ${scopeText}`);
for (const [n, r] of results) console.log(`${n.padEnd(10)} ${r}`);
const failed = results.filter(([, r]) => r === 'FAIL' || r === 'MISSING');
if (failed.length) { console.error(`GATE FAIL: ${failed.map(([n]) => n).join(', ')}`); process.exit(1); }
console.log('GATE PASS');
```

Notes on the replacement:
- The `GATE SUMMARY` lines `typecheck pass` and so on keep their format. Only a `scope` line is added, so EZD-002's CI reading is unaffected.
- `ci.yml` needs no change, because it calls `node scripts/gate.mjs .`, which is full scope.
- The lock is per machine (`os.tmpdir()`), so it covers the main checkout and every worktree. A second gate fails at once with a message instead of waiting. CI runners each have their own temp folder.

## Answered by agents (override any)

| Q-ID | Ticket | Answer | By |
| --- | --- | --- | --- |
| Q-0012 | EZD-000 | The vault copy of `docs/architecture.md` is refreshed on every merge that changes it | code-reviewer |
| Q-0021 | EZD-002 | Your CI change stands: CI runs on the phase PR and by hand | code-reviewer |
| Q-0022 | EZD-002 | Local tests prove CI catches failures; the first real CI run is the Phase 0 PR | code-reviewer |
| Q-0023 | EZD-004 | Database changes reach the cloud dev project only when you click Run in GitHub | code-reviewer |
| Q-0028 | EZD-026 | Split into 026a (helper) and 026b (language from user record) | orchestrator |
| Q-0042 | EZD-023 | Split into 023a (migration check) and 023b (environments, release) | orchestrator |
| Q-0044 | EZD-006 | Adding a job to a crew member's list does not sign them out; removing one does | security-reviewer |
| Q-0045 | EZD-007 | EZD-007 sets up a minimal browser-test runner; EZD-016a extends it | code-reviewer |
| Q-0052 | EZD-018 | When access is removed, open tabs are told at once and drop live updates; tokens last 1 hour | security-reviewer |
| Q-0060 | EZD-009 | EZD-009 waits for EZD-003's file on develop rather than adding a formal dependency | code-reviewer |
| Q-0061 | EZD-027 | "Smooth enough" = 95% of frames within budget, none over 100 ms | code-reviewer |
| Q-0062 | EZD-027 | No memory number; pass if the page doesn't crash on your iPad | code-reviewer |
| Q-0063 | EZD-027 | This PC's desktop result is recorded, not part of the verdict | code-reviewer |
| Q-0064 | EZD-027 | The go/no-go note waits for your iPad run; Phase 2 waits for the note | code-reviewer |
| Q-0066 | EZD-016b | EZD-302 makes the "unjoined wall" test drawing | code-reviewer |
| Q-0071 | EZD-017 | Download size measured gzip, 1 KB = 1,000 bytes | code-reviewer |
| Q-0072 | EZD-017 | Sign-in pages held to 200 KB like other non-editor pages | code-reviewer |
| Q-0073 | EZD-017 | No main-thread stall over 50 ms while panning | code-reviewer |
| Q-0079 | EZD-019 | Security settings for EZ Binder messages: signed with the company id included, 256-bit secrets and codes | security-reviewer |
| Q-0085 | Phase 0 | New ticket EZD-032 for the Phase 0 build-gate test | orchestrator |
| Q-0087 | EZD-006 | A server-only secret header on every database request, so a copied browser token can't read or write data directly | security-reviewer |
| Q-0005, Q-0007–Q-0010 | setup | Recorded earlier (see QUESTIONS.md) | orchestrator (setup) |
