// EZD-243 (vault/plans/EZD-243.md sections 3, 4 and 6): docs/runbook.md and docs/architecture.md say
// the live setup: the Resend key name and its replacement rule, the ezdraft-dev Site URL until launch,
// the main ruleset, the Vercel Auto-assign state until launch and the go-live text. The expected texts
// (W1-W17) are copied from the plan's section 6 table. Each test reads the files fresh; a section is the
// text from its heading line to the next heading of the same or higher level (docs-truth pattern, EZD-160).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const readDoc = (rel) => readFileSync(path.join(root, rel), 'utf8');
const runbook = () => readDoc('docs/runbook.md');
const arch = () => readDoc('docs/architecture.md');

const W1 = "3. **Create EZ Draft's key.** In Resend, open API keys, then Create API Key. Name `ezdraft-production`, permission Sending access, domain `ezcontractorbinder.com`. This key can only send email, and you can delete it without touching EZ Binder. Copy it straight into step 4. **Key names:** a key that replaces an earlier one gets the same name with the next number (`ezdraft-production-2`, then `ezdraft-production-3`; the same for `ezdraft-preview` and `ezdraft-dev-auth`), and what this runbook says about a key name also holds for its numbered replacements. The production key in Resend and Vercel now is `ezdraft-production-2` (the first was replaced on 2026-10-27).";
const W2 = "Production: the sending-only key `ezdraft-production-2` (the first, `ezdraft-production`, was replaced on 2026-10-27; a replacement takes the next number, runbook `## Email (EZD-008)` step 3); Preview only if Josh switches a preview to `resend` (Q-0041), then with its own key `ezdraft-preview`, never a production key (EZD-151)";
const W3 = "1. **Site URL and redirect list.** Authentication, URL Configuration. Site URL: for `ezdraft-prod` `https://ezdraft.ezcontractorbinder.com`. For `ezdraft-dev`, until launch, while the live address runs on `ezdraft-dev` (Q-0264): also `https://ezdraft.ezcontractorbinder.com`; with a preview address there, every sign-in link opened a preview build that showed \"Can't reach the database\". After launch (Before launch checklist, item 4): the preview address, which is the branch address Vercel gives `develop`. Copy it from Vercel, Deployments, the phase pull request's preview: the domain with `-git-develop-` in it. It always opens the newest `develop` preview. Redirect URLs: add the Site URL followed by `/auth/confirm`: `https://ezdraft.ezcontractorbinder.com/auth/confirm` for `ezdraft-prod` always and for `ezdraft-dev` until launch, then for `ezdraft-dev` the preview address followed by `/auth/confirm`. Nothing else in the list.";
const W4 = "1. **Cloudflare, Turnstile.** Add a widget for `ezdraft.ezcontractorbinder.com` and the preview address (section \"Sign-in (EZD-007)\", step 1). Leave the other settings at their defaults. Keep the site key and the secret key it shows.";
const W5 = "3. **`main` ruleset.** Settings → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**: name `main`; Enforcement status **Active**; Bypass list empty; Target branches → **Add target** → **Include default branch**. Rules: **Restrict deletions**; **Require a pull request before merging** with Required approvals **0** and **Require approval of the most recent reviewable push** off; **Require status checks to pass** with the check `gate`; **Block force pushes**. Save. Then Settings → **General** → **Pull Requests**: tick **Allow auto-merge**. This is the setting since 2026-10-24 (Q-0261): the agents open the phase pull request and turn on auto-merge, and GitHub merges it when `gate` passes. Do not push to a pull request branch yourself. When you say the system works and turn auto-merge off (Q-0261), untick **Allow auto-merge** and set Required approvals back to **1** with **Dismiss stale pull request approvals when new commits are pushed** and **Require approval of the most recent reviewable push**; from then on you approve and merge.";
const W6 = "Once Production holds the `ezdraft-prod` values, switch `ezdraft-dev`'s Site URL and redirect list to the preview address (section \"Sign-in (EZD-007)\", step 1).";
const W7 = "Settings, Environments, Production, Branch Tracking: **Auto-assign Custom Production Domains**. It is on since 2026-10-24 (Q-0264): until launch each merge into `main` goes live on the address at once, running on the `ezdraft-dev` database. At launch you turn it off (Before launch checklist, item 2) and keep it off: then a merge builds a staged production deployment that the address does not show, and only the release workflow makes a build live.";
const W8 = "5. **Domain in Vercel** (done Oct 12). Settings, Domains: `ezdraft.ezcontractorbinder.com`, connected to Production, not to `develop`. Until launch the address shows the newest merge into `main`, running on the `ezdraft-dev` database (Q-0264).";
const W9 = "(until launch it shows the newest merge into `main`, running on the `ezdraft-dev` database, Q-0264)";
const W10 = "The merge still goes live: with Auto-assign on (Vercel and the subdomain, step 2), Vercel puts the merge's production build on the address at once, running on the `ezdraft-dev` database, with no dump and no tag (Q-0264).";
const W11 = "- Phase field checks use the Vercel preview of the phase pull request before the phase merge, or the live address after it (Q-0264).";
const W12 = "**Auto-assign Custom Production Domains** (Vercel and the subdomain, step 2: Settings, Environments, Production, Branch Tracking) was off from the Vercel setup and is on since 2026-10-24 (Q-0264), so until launch each merge into `main` goes live on the address at once, on the `ezdraft-dev` database. Turn it off at Before launch item 2 and keep it off from then on: with it on, a merge would go live on the address before its migrations, and the release refuses to run (`vercel_auto_assign_on`).";
const W13 = "2. **Go-live switch and address.** Turn **Auto-assign Custom Production Domains** off (Settings, Environments, Production, Branch Tracking; on since 2026-10-24, Q-0264), so a merge into `main` no longer goes live by itself, and check that Vercel's Domains page shows `ezdraft.ezcontractorbinder.com` valid with a certificate.";
const W14 = "- Production branch `main`: production changes only when a phase PR merges into `main`. Until launch each merge goes live at once through Auto-assign, on the `ezdraft-dev` database (Q-0264); from launch a build goes live only when EZD-023b's release workflow promotes it.";
const W15 = "- Domain `ezdraft.ezcontractorbinder.com`. DNS is at Spaceship; Vercel provides the HTTPS certificate and the HTTP to HTTPS redirect. \"Auto-assign Custom Production Domains\" is on until launch, so the address serves each phase merge (Q-0264); Josh turns it off at launch (runbook Before launch checklist item 2) and it stays off, so from then on the address shows only a build the release workflow promotes (the release refuses to run while it is on, `vercel_auto_assign_on`).";
const W16c2 = "Supabase project `ezdraft-prod` in the same organization (Q-0024 (a)), created from the Before-launch checklist (Q-0113); until launch Vercel `Production` runs on `ezdraft-dev` (Q-0264)";
const W16c3 = "Vercel `Production` at `ezdraft.ezcontractorbinder.com` (R24 #1); live since 2026-10-24, each phase merge going live through Auto-assign until launch (Q-0264); from the first real release only builds the release promotes";
const W16c4 = "Vercel `Production` values = the prod project's values from launch (runbook Before launch item 4); until then the dev project's values (Q-0264)";
const W16c5 = "From launch only `.github/workflows/release.yml`, when Josh merges a pull request into `main` (Q-0106); until launch each merge into `main` goes live through Auto-assign (Q-0264)";
const W17 = "- **Go-live choice** (archived Step 2): \"Auto-assign Custom Production Domains\" was off from EZD-003 and is on since 2026-10-24 until launch, so each merge into `main` goes live on the address at once, on the `ezdraft-dev` database, with no dump and no release (Q-0264). Josh turns it off at launch (runbook Before launch checklist item 2) and it stays off: each merge into `main` still gets a production build but the domain moves to it only when the release promotes it through the Vercel API, after the dump and the migrations. With auto-assign on, new code could serve before its migrations, and a failed dump or migration would leave the new build live (Q-0106; 11 Operations: \"production is updated only by promoting a tagged build\"). The release refuses to run while it is on (`vercel_auto_assign_on`).";

const splitLines = (text) => text.split(/\r?\n/).map((l) => l.trimEnd());

// Throws when the heading is missing, so a renamed heading fails the test instead of passing on "".
function sectionText(doc, heading) {
  const lines = splitLines(doc);
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// Every line of the text (trimmed at the end) that starts with the prefix.
const linesStarting = (text, prefix) => splitLines(text).filter((l) => l.startsWith(prefix));

// The one line that starts with the prefix; fails when there are none or more than one.
function oneLineStarting(text, prefix) {
  const found = linesStarting(text, prefix);
  assert.equal(found.length, 1, `expected one line starting with ${JSON.stringify(prefix)}, found ${found.length}`);
  return found[0];
}

// Table cells of a `|` row (the `cells` helper of scripts/email/__tests__/send-test-args.test.mjs).
const cells = (l) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const tableRows = (text) => splitLines(text).filter((l) => l.trim().startsWith('|'));

const countOf = (text, phrase) => text.split(phrase).length - 1;

describe('EZD-243 runbook and architecture match the live setup', () => {
  it('EZD-243 done when: the runbook and the architecture row name the live key and the naming rule', () => {
    const step3 = oneLineStarting(sectionText(runbook(), '## Email (EZD-008)'), '3. ');
    assert.equal(step3, W1);
    const rows = tableRows(sectionText(arch(), '### Environment variables')).filter(
      (l) => cells(l)[0] === '`RESEND_API_KEY`',
    );
    assert.equal(rows.length, 1, 'one RESEND_API_KEY row');
    const c = cells(rows[0]);
    assert.equal(c.length, 5, 'RESEND_API_KEY row has five cells');
    assert.equal(c[1], 'never');
    assert.equal(c[3], W2);
  });

  it('EZD-243 done when: the ezdraft-dev Site URL is the live address until launch', () => {
    const s = sectionText(runbook(), '## Sign-in (EZD-007)');
    assert.equal(oneLineStarting(s, '1. '), W3);
  });

  it('EZD-243 the preview address is defined once and the switch is in the launch checklist', () => {
    const doc = runbook();
    assert.equal(countOf(doc, 'the environments setup records'), 0);
    const captcha = sectionText(doc, '## Captcha (EZD-034)');
    assert.equal(oneLineStarting(captcha, '1. '), W4);
    const item4 = oneLineStarting(sectionText(doc, '### Before launch checklist'), '4. ');
    assert.ok(item4.endsWith(' ' + W6), 'item 4 ends with one space and the W6 text');
    assert.ok(!item4.endsWith('  ' + W6), 'item 4 has exactly one space before the W6 text');
  });

  it('EZD-243 the main ruleset step matches Q-0261', () => {
    const s = sectionText(runbook(), "### Josh's GitHub and account settings");
    assert.equal(oneLineStarting(s, '3. '), W5);
  });

  it('EZD-243 the Vercel steps match Q-0264', () => {
    const s = sectionText(runbook(), '## Vercel and the subdomain (EZD-003)');
    const bullet = oneLineStarting(s, '   - Settings, Environments, Production, Branch Tracking:');
    assert.equal(bullet, '   - ' + W7);
    assert.equal(oneLineStarting(s, '5. '), W8);
  });

  it('EZD-243 the email check and the release subsections match Q-0264', () => {
    const email = sectionText(runbook(), '## Email (EZD-008)');
    const thenRun = linesStarting(email, '   Then run ');
    assert.equal(thenRun.length, 1, 'one Then-run line');
    assert.equal(countOf(thenRun[0], W9), 1, 'the Then-run line holds W9 exactly once');
    const bullets = linesStarting(sectionText(runbook(), '### Until launch'), '- ');
    assert.equal(bullets.length, 2, 'two Until-launch bullets');
    assert.ok(bullets[0].endsWith(' ' + W10), 'first bullet ends with one space and W10');
    assert.ok(!bullets[0].endsWith('  ' + W10), 'first bullet has exactly one space before W10');
    assert.equal(bullets[1], W11);
    const goLive = sectionText(runbook(), '### Go-live switch')
      .split(/\r?\n/)
      .slice(1)
      .filter((l) => l.trim() !== '');
    assert.deepEqual(goLive, [W12]);
    assert.equal(oneLineStarting(sectionText(runbook(), '### Before launch checklist'), '2. '), W13);
  });

  it('EZD-243 the architecture hosting and release lines match Q-0264', () => {
    const doc = arch();
    const hosting = sectionText(doc, '### Hosting');
    assert.equal(oneLineStarting(hosting, '- Production branch'), W14);
    assert.equal(oneLineStarting(hosting, '- Domain '), W15);
    const releases = sectionText(doc, '### Environments and releases (EZD-023b)');
    const rows = tableRows(releases).filter((l) => cells(l)[0] === 'production');
    assert.equal(rows.length, 1, 'one production row');
    const c = cells(rows[0]);
    assert.equal(c.length, 5, 'production row has five cells');
    assert.deepEqual(c.slice(1), [W16c2, W16c3, W16c4, W16c5]);
    assert.equal(oneLineStarting(releases, '- **Go-live choice**'), W17);
  });

  it('EZD-243 no stale go-live text is left', () => {
    const r = runbook();
    for (const phrase of ['could not be found', 'Never turn it back on', 'is still off']) {
      assert.equal(countOf(r, phrase), 0, `runbook still says: ${phrase}`);
    }
    const a = arch();
    for (const phrase of [
      'is off and stays off',
      'is off since EZD-003',
      'first made live by the first real release',
    ]) {
      assert.equal(countOf(a, phrase), 0, `architecture still says: ${phrase}`);
    }
  });
});

// EZD-247 (vault/plans/EZD-247.md sections 3, 4 and 6): the remaining lines that still say the
// Supabase values sit in Vercel only from launch. Until launch the live address and the previews
// both run on ezdraft-dev (Q-0264). The expected texts (W1-W7) are copied from the plan's section 6
// table; each is one whole line (W3c3 and W3c4 one table cell each).
const EZD247_W1 = "3. **Environment variables** (done 2026-10-19). Settings, Environment Variables: `ENABLE_EXPERIMENTAL_COREPACK` = `1` for Production and Preview. It is not a secret. Supabase values: Preview holds the `ezdraft-dev` values (entered 2026-10-21). Until launch Production holds the `ezdraft-dev` values too (entered 2026-10-24, Q-0264), so the live address runs on the `ezdraft-dev` database. From launch Production holds the `ezdraft-prod` values (Before launch checklist, item 4).";
const EZD247_W2 = "10. **API gate secret (EZD-006; Q-0087).** For each cloud project (dev, prod) run `node scripts/db/api-gate.mjs generate` on this PC. Paste the printed `select private.set_api_gate_hash('…');` line into that project's SQL editor and run it. Put the printed secret into Vercel as `SUPABASE_API_GATE_SECRET` for each environment that runs on that project: until launch the dev project's secret goes into both Preview and Production, because the live address runs on `ezdraft-dev` (Q-0264); from launch Preview keeps the dev project's secret and Production gets the prod project's (Before launch checklist, items 4 and 10). A project keeps only its newest hash, so after a new generate put the new secret into every environment that runs on that project. Use a different secret per project; never paste a secret into chat, a ticket or the repo. Until this is done, the gate refuses every signed-in request on that project (it fails closed).";
const EZD247_W3c3 = "Vercel Preview of the phase pull request (Q-0116 (a)); a plain `develop` push builds no preview; until launch also Vercel `Production` at `ezdraft.ezcontractorbinder.com` (Q-0264), so phase field checks use the preview before the phase merge and the live address after it; from launch the Preview only";
const EZD247_W3c4 = "Vercel `Preview` values = the dev project's values; `EMAIL_TRANSPORT` `stub` by default (Q-0041); until launch Vercel `Production` also holds the dev project's Supabase values (Q-0264); from launch only `Preview` does";
const EZD247_W4 = "- **Until launch** a merge releases nothing: the `release` environment holds no secrets, so the run ends `not_configured` and is green (Q-0113). The merge still goes live: with Auto-assign on (Go-live choice above), Vercel puts its production build on the address at once, running on the `ezdraft-dev` database, with no dump and no tag (Q-0264). From launch a build goes live only when the release promotes it.";
const EZD247_W5 = "7. **App keys.** Each project's URL, publishable key and secret key go into Vercel, never into the repo. The `ezdraft-dev` values went into Preview on 2026-10-21 and, until launch, into Production too on 2026-10-24 (Q-0264), so the live address runs on the `ezdraft-dev` database. From launch Production holds the `ezdraft-prod` values (Before launch checklist, item 4).";
const EZD247_W6 = "Which project's values go where: local is the local stack; preview is the dev project (11 Operations: preview deploys use the dev database); until launch production is the dev project too, so the live address runs on the `ezdraft-dev` database (Q-0264); from launch production is the production project, which Josh sets up from the Before-launch checklist (items 1 and 4; Q-0113). Josh enters the values in Vercel by hand from `docs/runbook.md` (Vercel and the subdomain, step 3; Before launch checklist, item 4); agents never change Vercel settings.";
const EZD247_W7 = "- Previews only for the phase PR, read as a pull request from `develop` (Vercel names no target branch), through the Ignored Build Step in the Vercel project; a pull request from any other branch builds nothing. A plain `develop` push builds no preview; the gate's empty `chore: preview` commit after the PR opens gives the PR its preview. Previews use the `ezdraft-dev` database (its values entered in Vercel `Preview` on 2026-10-21); until launch Production uses it too (Q-0264).";

describe('EZD-247 runbook and architecture match Q-0264 (remaining lines)', () => {
  it('EZD-247 done when: the Vercel environment step states the Supabase values before and after launch', () => {
    const step3 = oneLineStarting(sectionText(runbook(), '## Vercel and the subdomain (EZD-003)'), '3. ');
    assert.equal(step3, EZD247_W1);
  });

  it('EZD-247 done when: the gate secret step names the environments before and after launch', () => {
    const step10 = oneLineStarting(sectionText(runbook(), '## Supabase cloud projects (EZD-004)'), '10. ');
    assert.equal(step10, EZD247_W2);
  });

  it('EZD-247 done when: the dev row states the live address until launch', () => {
    const rows = tableRows(sectionText(arch(), '### Environments and releases (EZD-023b)')).filter(
      (l) => cells(l)[0] === 'dev',
    );
    assert.equal(rows.length, 1, 'one dev row');
    const c = cells(rows[0]);
    assert.equal(c.length, 5, 'dev row has five cells');
    assert.equal(c[2], EZD247_W3c3, 'App cell of the dev row');
    assert.equal(c[3], EZD247_W3c4, 'Env values cell of the dev row');
  });

  it('EZD-247 done when: the Until launch bullet says the merge still goes live', () => {
    const s = sectionText(arch(), '### Environments and releases (EZD-023b)');
    assert.equal(oneLineStarting(s, '- **Until launch**'), EZD247_W4);
  });

  it('EZD-247 done when: no line says Production uses the prod project before launch or field checks use only the preview', () => {
    const r = runbook();
    const a = arch();
    assert.equal(countOf(r, 'No Supabase values yet'), 0, 'runbook still says: No Supabase values yet');
    assert.equal(countOf(r, 'Production = prod project'), 0, 'runbook still says: Production = prod project');
    assert.equal(countOf(a, 'phase field checks use it until launch'), 0, 'architecture still says: phase field checks use it until launch');
    assert.equal(countOf(a, 'Preview of the phase pull request only'), 0, 'architecture still says: Preview of the phase pull request only');
  });

  it('EZD-247 the App keys step, the Environment variables paragraph and the Hosting previews bullet state the Q-0264 setup', () => {
    const r = runbook();
    const a = arch();
    assert.equal(oneLineStarting(sectionText(r, '## Supabase cloud projects (EZD-004)'), '7. '), EZD247_W5);
    assert.equal(oneLineStarting(sectionText(a, '### Environment variables'), "Which project's values go where:"), EZD247_W6);
    assert.equal(oneLineStarting(sectionText(a, '### Hosting'), '- Previews only for the phase PR'), EZD247_W7);
    assert.equal(countOf(r, "in EZD-023b's setup"), 0, "runbook still says: in EZD-023b's setup");
    assert.equal(countOf(a, 'Entering values in Vercel is EZD-023b\'s'), 0, "architecture still says: Entering values in Vercel is EZD-023b's");
    assert.equal(countOf(a, 'once EZD-023b enters its values'), 0, 'architecture still says: once EZD-023b enters its values');
  });
});
