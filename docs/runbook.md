# Runbook

## Vercel and the subdomain (EZD-003)

Josh's steps in Vercel and at the DNS host. All are done; this is the record. Agents never change Vercel or DNS settings.

1. **Create the project** (done Oct 12). In EZ Binder's Vercel team: Add New, Project, import `IronFrame414/EZ-Draft`, name it `ezdraft`, Framework Next.js, Root Directory `app` (or later Settings, Build and Deployment, Root Directory). Leave "Include files outside the root directory" on. The first production build of `main` fails until the Phase 0 merge; that is expected.
2. **Build and branch settings** (done 2026-10-19; EZD-149 changed the Ignored Build Step command below: paste it again in Vercel).
   - Production Branch is `main`.
   - Settings, Build and Deployment, **Ignored Build Step**, option Custom, with exactly: `[ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 1; [ "$VERCEL_GIT_COMMIT_REF" = "develop" ] && [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 1; exit 0`. Production builds only from `main`. A preview builds only for a pull request from `develop` (the phase PR); a plain `develop` push and a pull request from any other branch build nothing.
   - Settings, Environments, Production, Branch Tracking: **Auto-assign Custom Production Domains** off, before any pull request is merged into `main`. With it off, a merge builds a staged production deployment that the address does not show; only the release workflow makes a build live. Never turn it back on.
3. **Environment variables** (done 2026-10-19). Settings, Environment Variables: `ENABLE_EXPERIMENTAL_COREPACK` = `1` for Production and Preview. It is not a secret. No Supabase values yet; EZD-023b enters them.
4. **Deployment Protection** (done 2026-10-19). Leave the default, Standard Protection, with Vercel Authentication on. Leave Settings, Security, Git Fork Protection on. Previews need a Vercel login; the production address stays public.
5. **Domain in Vercel** (done Oct 12). Settings, Domains: `ezdraft.ezcontractorbinder.com`, connected to Production, not to `develop`. Until the first real release the address shows "The deployment could not be found"; that is expected.
6. **DNS record at Spaceship** (done). Host `ezdraft`, a `CNAME` with the value exactly as Vercel shows; add a `_vercel` TXT record too if Vercel asks. Never change the existing `ezcontractorbinder.com` record (EZ Binder).
7. **Certificate** (done). HTTPS is automatic.
8. **Before the first real release:** check Vercel's Domains page still shows the domain valid with a certificate. The release workflow checks the subdomain right after it makes the build live.

## Supabase cloud projects (EZD-004)

Josh's steps in Supabase and GitHub. Agents never connect to a cloud database. The workflow `.github/workflows/supabase-dev.yml` is the only thing that changes `ezdraft-dev`.

1. **Create the dev project.** In EZ Binder's Supabase organization (it is on Pro): New project, name `ezdraft-dev`, region East US (North Virginia), next to the app's Vercel functions. Never use one of EZ Binder's own projects: EZ Draft never writes to EZ Binder's database. Do not create `ezdraft-prod` yet; it comes from the Before-launch checklist.
2. **Database password.** A new password of letters and digits only (no symbols), at least 20 characters, used nowhere else. Keep only made-up test data in this project, never real client data.
3. **Postgres version.** Tell the orchestrator the Postgres version the new project shows (Project Settings, Infrastructure). It checks it against `supabase/config.toml`.
4. **Lock the GitHub environment first.** In the GitHub repository: Settings, Environments, New environment `dev`. Deployment branches and tags: Selected branches and tags, add branch `develop` only. Turn off "Allow administrators to bypass configured protection rules" if GitHub shows it. Save protection rules.
5. **Then add the secret.** In the Supabase project: Connect, Session pooler, copy the connection string and put your password where the string shows the password placeholder. In the `dev` environment: Add environment secret, name `SUPABASE_DEV_DB_URL`, value that string. Never as a repository secret; if a repository secret with that name exists, delete it. GitHub's machines cannot reach the direct connection, so it must be the Session pooler string.
6. **First run.** From then on the workflow runs by itself whenever `develop` is pushed with new migrations. To apply what is already there, after the Phase 0 merge: Actions, Supabase dev migrations, Run workflow, branch `develop`. A green run with the note "SUPABASE_DEV_DB_URL not set" means step 5 is not done yet.
7. **App keys.** Each project's URL, publishable key and secret key go into Vercel in EZD-023b's setup, never into the repo.
8. **Production** gets migrations only from the release workflow when you merge into `main` (EZD-023b).
9. **Token hook (EZD-006).** After the migrations reach a cloud project, open Authentication, Hooks, Custom Access Token, choose the Postgres function `private.custom_access_token_hook`, and enable it. Until then, users of that project read no rows.
10. **API gate secret (EZD-006; Q-0087).** For each cloud project (dev, prod) run `node scripts/db/api-gate.mjs generate` on this PC. Paste the printed `select private.set_api_gate_hash('…');` line into that project's SQL editor and run it. Put the printed secret into Vercel as `SUPABASE_API_GATE_SECRET` for the matching environment (Preview = dev project, Production = prod project). Use a different secret per project; never paste a secret into chat, a ticket or the repo. Until this is done, the gate refuses every signed-in request on that project (it fails closed).
11. **Project settings (EZD-006).** Leave "Automatically expose new tables" and "Enable automatic RLS" as they were set when the projects were created (on and off). The app grants table access and turns on RLS in its own migrations, so it works either way; changing them later could alter access on tables that already exist.

## Tenant 1 setup (EZD-005)

Worth Properties is company 1 in EZ Draft and you are its owner. On the local test database this happens by itself every time it is reset. Each cloud database gets it once from the file `supabase/bootstrap/tenant-1.sql`. The file holds no email; you type yours in only where it runs.

**Dev (`ezdraft-dev`), once:**

1. **Wait for the migrations.** The "Supabase dev migrations" workflow (section "Supabase cloud projects", step 6) must have run green on `develop` after this setup reached `develop`. If it has not, open Actions, Supabase dev migrations, Run workflow, branch `develop`.
2. **Copy the file.** Open `supabase/bootstrap/tenant-1.sql` on GitHub and copy all of it.
3. **Paste it.** In Supabase open the `ezdraft-dev` project, then SQL Editor, New query, and paste.
4. **Type your email.** Replace `PASTE-YOUR-EMAIL-HERE` with the email you sign in with. Keep the quote marks around it.
5. **Run it.** Press Run. "Success" or `ezd_bootstrap_done` means Worth Properties and your owner account now exist. `ezd_bootstrap_email_missing` means the email was not typed in correctly; fix it and run again. `ezd_bootstrap_already_done` means this project is already set up, and nothing changed.
6. **Keep the email out of the repo.** Never paste the edited text into chat, a ticket or the repo.

**Production (`ezdraft-prod`): nothing to paste.**

7. Production does not exist until launch. When you set it up from the Before-launch checklist, add the email you sign in with as the secret `TENANT1_OWNER_EMAIL` in the GitHub environment `release`. The first real release then creates Worth Properties and your owner account. If company 1 is already there, the release skips this. Do not paste the file into production.
8. After that first release, delete `TENANT1_OWNER_EMAIL` from the `release` environment. Until you do, every release summary shows the notice `owner_email_secret_unused`.

## Email (EZD-008)

Josh's steps in Resend, Vercel and Supabase. For now EZ Draft sends from EZ Binder's verified domain `ezcontractorbinder.com`, in the Resend account the two apps share. Agents never change Resend, DNS, Vercel or Supabase settings. Never paste a key into chat, a ticket or the repo.

1. **Check the domain.** In Resend, open Domains. `ezcontractorbinder.com` should show Verified. Do not add a domain; EZ Draft uses this one.
2. **DNS at Spaceship: no change.** EZ Draft needs no new email records. Never change the existing `ezcontractorbinder.com` records; EZ Binder's email depends on them.
3. **Create EZ Draft's key.** In Resend, open API keys, then Create API Key. Name `ezdraft-production`, permission Sending access, domain `ezcontractorbinder.com`. This key can only send email, and you can delete it without touching EZ Binder. Copy it straight into step 4.
4. **Vercel values (Production).** In the `ezdraft` project: Settings, Environment Variables, Production. `EMAIL_TRANSPORT` = `resend`. `EMAIL_FROM` = `EZ Draft <no-reply@ezcontractorbinder.com>`. `RESEND_API_KEY` = the key from step 3, marked Sensitive. The Preview values come with the environments setup (EZD-023b): `EMAIL_TRANSPORT` = `stub`, so previews email nobody and the sender gets the link from Copy link. If you later switch a preview to `resend`, it emails the real addresses in the dev data. Before you switch a preview to `resend`, create a separate key in Resend: name `ezdraft-preview`, permission Sending access, domain `ezcontractorbinder.com`, and put it in the Preview `RESEND_API_KEY`. Never put `ezdraft-production` in Preview.
5. **Live check (field check).** On this PC, open a terminal in the EZ Draft folder and put the values in that terminal only:
   - Mac: run `read -rs RESEND_API_KEY && export RESEND_API_KEY`, paste the key (nothing shows) and press Return. Then run `export EMAIL_FROM='EZ Draft <no-reply@ezcontractorbinder.com>'`.
   - Windows PowerShell: run `$env:RESEND_API_KEY = Read-Host 'Resend key'`, paste the key and press Enter. Then run `$env:EMAIL_FROM = 'EZ Draft <no-reply@ezcontractorbinder.com>'`.

   Then run `node scripts/email/send-test.mjs --to <your email address>`. It prints "Sent." and a message id. In your mailbox: the email "EZ Draft email check" is in the inbox, not spam; the sender shows `EZ Draft <no-reply@ezcontractorbinder.com>`; "Show original" shows SPF, DKIM and DMARC all `PASS`; the link opens `https://ezdraft.ezcontractorbinder.com/` (until the first real release it shows "The deployment could not be found"; that is expected). Close the terminal, which clears the key, and tell the orchestrator what you saw.
6. **Sign-in emails through Resend (Supabase).** Supabase sends the sign-in emails itself. Do this for `ezdraft-dev` now, and for `ezdraft-prod` when the Before-launch checklist creates it. In Resend, create one more key: name `ezdraft-dev-auth` (or `ezdraft-prod-auth`), permission Sending access, domain `ezcontractorbinder.com`. In the Supabase project open Authentication, SMTP Settings (https://supabase.com/dashboard/project/_/auth/smtp), turn on custom SMTP and enter: sender email `no-reply@ezcontractorbinder.com`, sender name `EZ Draft`, host `smtp.resend.com`, port `465`, username `resend`, password = that key. Save. Sign-in emails show "EZ Draft", not a company name, because no company is known before sign-in. Then in Resend open Domains, `ezcontractorbinder.com`: if link (click) tracking is on, tell the orchestrator before changing anything. Tracking can break sign-in links, and EZ Binder uses the same domain.
7. **Company reply address.** Replies to a company's emails go to the company email in Settings, Company, Contact (that screen comes in Phase 1). Until you fill it in, company emails carry no reply address, so a reply goes to `no-reply@ezcontractorbinder.com`.

## Sign-in (EZD-007)

Josh's steps in Supabase, once per cloud project: `ezdraft-dev` now, `ezdraft-prod` when the Before-launch checklist creates it. The local test stack gets all of this from `supabase/config.toml` by itself; a cloud project gets none of it until these steps are done, and until then that project signs people in with Supabase's defaults. The three sign-in migrations (the invite rule, the account gate and the password guard) reach the cloud with the other migrations (section "Supabase cloud projects"). Agents never change Supabase settings.

1. **Site URL and redirect list.** Authentication, URL Configuration. Site URL: for `ezdraft-prod` `https://ezdraft.ezcontractorbinder.com`; for `ezdraft-dev` the preview address the environments setup records (EZD-023b). Redirect URLs: add the Site URL followed by `/auth/confirm` (for example `https://ezdraft.ezcontractorbinder.com/auth/confirm`). Nothing else in the list.
2. **Email sign-in settings.** Authentication, Providers (or Sign In / Providers), Email: Confirm email on; Secure password change on; Email OTP Length `6`; Email OTP Expiration `900` seconds (the link and code are valid 15 minutes).
3. **Session lengths.** Authentication, Sessions: the inactivity timeout (the dashboard calls it "Inactivity timeout" or "Time-box user sessions, inactivity") is 400 days, entered as `9600` hours if the box takes hours; the access token (JWT) expiry (the box under Sessions or JWT settings called "Access token expiry" or "JWT expiry") is `3600` seconds. If a box is not where this says, look for the same words and tell the orchestrator where you found it.
4. **Email templates.** Authentication, Emails (Email Templates). For both "Confirm signup" and "Magic Link": subject exactly `Your EZ Draft sign-in link and code / Tu enlace y código para entrar en EZ Draft`; body = the whole text of `supabase/templates/sign-in.html` from GitHub (open the file, Raw, select all, copy, paste over the template's body). Save each. Do not change "Invite user", "Change email address" or "Reset password"; later tickets set those.
5. **Account gate hook.** Authentication, Hooks, "Before User Created": Postgres function, schema `private`, function `auth_before_user_created`, enable it. Until this is on, anyone with the project's public key could create an account for any email on that project. This is the same place as the Custom Access Token hook (section "Supabase cloud projects", step 9).
6. **Sending through Resend.** Section "Email (EZD-008)", step 6 (custom SMTP). Leave Authentication, Rate Limits, "Rate limit for sending emails" at the default Supabase shows for custom SMTP.

## Password sign-in (EZD-033)

Josh's steps in Supabase, once per cloud project (`ezdraft-dev` now, `ezdraft-prod` when the Before-launch checklist creates it). The local test stack gets the length, the rules and the templates from `supabase/config.toml`. The throttle needs nothing here: its key comes from the API gate secret already entered for EZD-006. Agents never change Supabase settings. If a box is not where this says, look for the same words and tell the orchestrator where you found it.

1. **Minimum password length: 8 characters (required).** Authentication, Providers (or Sign In / Providers), Email, "Minimum password length": `8`. Required: direct calls to Supabase Auth rely on it (Q-0094 override, 2026-10-18; Q-0105).
2. **No required character types.** Same page, "Password requirements": "No required characters" (Q-0094).
3. **Leaked-password protection on (required).** Same page, "Prevent use of leaked passwords" (a Pro plan feature): on. Required (Q-0094; Q-0105).
4. **Reset-password email.** Authentication, Emails (Email Templates), "Reset password": subject exactly `EZ Draft password reset requested / Se pidió restablecer tu contraseña de EZ Draft`; body = the whole text of `supabase/templates/recovery.html` from GitHub (open the file, Raw, select all, copy, paste over the template's body). Save. It has no link and no code on purpose.
5. **Reauthentication email.** Same place, "Reauthentication": subject exactly `Your EZ Draft confirmation code / Tu código de confirmación de EZ Draft`; body = the whole text of `supabase/templates/reauthentication.html`, copied the same way. Save.
6. **Rate limits.** Leave Authentication, Rate Limits at Supabase's defaults (Q-0105).

## Captcha (EZD-034)

Josh's steps in Cloudflare, Vercel and Supabase. The security check on the sign-in page runs only where the site key is set; locally and in tests it is off. Agents never change these settings. Neither key goes in the repo, and the secret key goes only into Supabase. If a box is not where this says, look for the same words and tell the orchestrator where you found it.

1. **Cloudflare, Turnstile.** Add a widget for `ezdraft.ezcontractorbinder.com` and the preview address the environments setup records (EZD-023b). Leave the other settings at their defaults. Keep the site key and the secret key it shows.
2. **Vercel `ezdraft`.** Settings, Environment Variables: `TURNSTILE_SITE_KEY` = the site key, for Preview and Production. Redeploy.
3. **See the check.** Open the preview's `/sign-in`: the security check shows below the password box.
4. **Supabase `ezdraft-dev`.** Authentication, Bot and Abuse Protection: captcha protection on, provider Turnstile, secret = the Turnstile secret key.
5. **Hand check.** In a terminal, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the dev project's values, run `node scripts/auth/captcha-check.mjs`, and report PASS or FAIL to the orchestrator.
6. **Sign in once on the preview.**
7. **`ezdraft-prod`.** Do steps 4-6 for it when the Before-launch checklist creates it.

## Background jobs (EZD-009)

Josh's steps in Vercel. The once-a-minute sweep picks up jobs that are waiting to retry or whose run died. Vercel runs cron jobs on production deployments only, so previews get no sweep. The `ezdraft` project sits in EZ Binder's Vercel team, which is on Pro, so a cron every minute is allowed. Agents never change Vercel settings. Never paste the secret into chat, a ticket or the repo.

1. **Cron secret.** In Vercel, open the `ezdraft` project, then Settings, Environment Variables. Add `CRON_SECRET` for Production only, marked Sensitive. The value is a random string of at least 32 characters (for example from a password manager's generator). Vercel sends it with every cron request, and the sweep refuses any request without it.
2. **Check the cron (after the Phase 0 merge).** In the `ezdraft` project, open Settings, Cron Jobs. It lists `/api/jobs/sweep` with the schedule `* * * * *` (every minute). If it is missing, or Vercel says the plan does not allow it, tell the orchestrator before changing anything.

## Error reporting (EZD-024)

Josh's steps in Sentry and Vercel. Steps 1 to 4 are part of the Before-launch checklist. Until then `SENTRY_TRANSPORT` is not set, so Sentry is off; new errors still email `ALERT_EMAIL_TO` once that is set. Agents never sign in to Sentry or change Vercel settings. Never paste the DSN or an address into chat, a ticket or the repo.

1. **Sentry account.** Create a new Sentry organization on the free plan, with one project named `ezdraft`, platform Next.js.
2. **DSN.** In the project, open Settings, Client Keys (DSN), and copy the DSN. It goes straight into step 4.
3. **Turn off Sentry's own emails.** In the project, open Alerts and turn off the default "new issue" email alert. EZ Draft emails each new error once itself.
4. **Vercel values (Production and Preview).** In the `ezdraft` project: Settings, Environment Variables. `SENTRY_TRANSPORT` = `sentry`; `SENTRY_DSN` = the DSN from step 2; `ALERT_EMAIL_TO` = your own address. Optional: `SENTRY_ISSUES_URL` = the address of the project's Issues page, so error emails link straight to the issue. Previews use the stub email transport by default, so preview alerts are recorded but not emailed unless you switch that preview to live sending.
5. **Who gets what.** New errors go only to `ALERT_EMAIL_TO`. Failed background jobs and failed EZ Binder deliveries go to `ALERT_EMAIL_TO` and to every Owner of that company, one email each; if your address is both, you get one. At most 20 alerts are emailed per hour.
6. **Live check (field check).** After the first real release before launch (Actions, Release is green with `released`), open a terminal in the EZ Draft folder and run `node scripts/errors/live-check.mjs`. It prints a code of 12 letters. Within a few minutes you should see one new issue in Sentry and one alert email, both with that code. Running it again with the same code (`node scripts/errors/live-check.mjs <code>`) sends no second email. Tell the orchestrator what you saw.

## AI providers (EZD-021)

Josh's steps with the AI providers and in Vercel. Set them before launch, as part of the Before launch checklist item 4 "Vercel values". Until then nothing is blocked: tests and previews run on the stub providers, and until launch a merge releases nothing. Agents never sign in to a provider or change Vercel settings. Never paste a key into chat, a ticket or a file in the repo.

1. **Pick the accounts.** Which accounts serve Gemini and Flux is your choice after your tests (Q-0076). Claude is served by Anthropic's own API and GPT Image 2 by OpenAI's.
2. **Keys.** On each chosen account, create one API key for EZ Draft, named `ezdraft-production`: Anthropic (`ANTHROPIC_API_KEY`), Google Gemini (`GEMINI_API_KEY`), OpenAI (`OPENAI_API_KEY`) and Black Forest Labs (`BFL_API_KEY`).
3. **Other address (only if needed).** If the account you picked for Gemini or Flux serves the same API at another address, you will set `GEMINI_BASE_URL` or `BFL_BASE_URL` (an `https://` address) in step 5. Otherwise leave them unset; EZ Draft then uses Google's and Black Forest Labs' own addresses.
4. **Spending limit.** In each provider's console, set a monthly spending limit.
5. **Vercel, Production.** In the `ezdraft` project: Settings, Environment Variables. For Production set `AI_MODE` = `live` and the four keys from step 2, each marked Sensitive (plus the address from step 3, if any). A missing key makes only the AI jobs that need it fail, with "AI key not set".
6. **Vercel, Preview.** For Preview set `AI_MODE` = `stub`. That is the default for now (no paid accounts yet), so previews never make paid calls. To let a preview make real, paid AI calls later, change Preview `AI_MODE` to `live` and add the Preview keys; every AI action tried on that preview then costs money (Q-0077).
7. **If a release stops on it.** After launch, the release workflow's step "Check the Vercel environment values" accepts Preview `AI_MODE` = `stub` or `live` and refuses a missing or other value (and Production needs an `AI_MODE` value). If it refuses, the release stops before anything changes and the live site stays as it was: fix the value in Vercel, then press **Re-run jobs** on that run.
8. **Names to leave unset.** Never add these names in Vercel, for Production or Preview: `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_LOG`, `ANTHROPIC_OPEN_TELEMETRY`, `ANTHROPIC_OPEN_TELEMETRY_PROPAGATION`, `ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE` and `ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`. The Claude library EZ Draft uses reads them each time it calls Claude: the first adds its headers to every Claude request, the second makes the library write its own log lines, and the others change its tracing. EZ Draft passes the key and the address itself, so `ANTHROPIC_API_KEY` is the only `ANTHROPIC_` name to set.

## Environments and releases (EZD-023)

How production changes. Merging a pull request into `main` starts Actions → **Release** (`.github/workflows/release.yml`). It saves a copy of the production database to Backblaze under `releases/`, applies the migrations, sets up Worth Properties and your owner account on the first release, tags the commit (`phase-N` or `phase-N.k`), makes that commit's own build live and checks the site. If anything fails before the build goes live, the live site does not change. If the checks after going live fail, it puts the previous build back. Agents never see the production secrets; they live only in the GitHub environment `release`.

### Until launch
- Merging into `main` releases nothing. Actions → **Release** ends green with the summary `production not configured — nothing released`, because `release` holds no secrets yet.
- Phase field checks use the Vercel preview of the phase pull request.

### Go-live switch
**Auto-assign Custom Production Domains** has been off since the Vercel setup (Vercel and the subdomain, step 2: Settings, Environments, Production, Branch Tracking). Never turn it back on. With it on, a merge would go live on the address before its migrations, and the release refuses to run (`vercel_auto_assign_on`).

### Josh's GitHub and account settings
Do these in the browser under your own GitHub account.
1. **Agent account** (done 2026-10-12). The agents push as `ironframe414-agent`, a collaborator on `IronFrame414/EZ-Draft` with the **Write** role. Never give it Maintain or Admin.
2. **Build computer** (done 2026-10-12). `gh` and Git on the build computer are signed in as the agent account. Never sign your own GitHub account in there. On a new build computer, sign in as the agent account only.
3. **`main` ruleset.** Settings → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**: name `main`; Enforcement status **Active**; Bypass list empty; Target branches → **Add target** → **Include default branch**. Rules: **Restrict deletions**; **Require a pull request before merging** with Required approvals **1**, **Dismiss stale pull request approvals when new commits are pushed** and **Require approval of the most recent reviewable push**; **Require status checks to pass** with the check `gate`; **Block force pushes**. Save. Agents open the pull requests; you approve and merge. Do not push to a pull request branch yourself.
4. **`develop` ruleset.** New branch ruleset `develop`, Active, target branch `develop`, rules **Restrict deletions** and **Block force pushes**.
5. **Tag ruleset.** New ruleset → **New tag ruleset** `release tags`, Active, target pattern `phase-*`, rules **Restrict updates** and **Restrict deletions**. Creating tags stays allowed, so the release can tag.
6. **Actions settings.** Settings → **Actions** → **General**. Actions permissions: allow IronFrame414's actions and selected others, with **Allow actions created by GitHub** ticked; if GitHub offers **Require actions to be pinned to a full-length commit SHA**, tick it. Fork pull request workflows: **Require approval for all external contributors**. Workflow permissions: **Read repository contents and packages permissions**, and untick **Allow GitHub Actions to create and approve pull requests**. Save. The release job asks for its own right to create the tag.
7. **Secret scanning.** Settings → **Code security** → **Secret scanning**: Enable; **Push protection**: Enable.
8. **Environment `dev`.** Settings → **Environments** → **New environment** `dev` → **Deployment branches and tags** → **Selected branches and tags** → add branch `develop` only → turn off "Allow administrators to bypass configured protection rules" if shown → **Save protection rules** → only then add the secret `SUPABASE_DEV_DB_URL` (Supabase cloud projects). If an older **repository secret** has that name, delete it.
9. **Environment `release`.** **New environment** `release` → **Selected branches and tags** → branch `main` only → administrators cannot bypass → **Save protection rules**. Add no secrets until the Before launch checklist.
10. **Leave Vercel's `Production` environment alone.** GitHub lists an environment `Production` that Vercel made for its deployment records. Never add a secret to it, and never put a production value in a repository secret or an organization secret.
11. Optional: add the lines under "Safety net" to your own Claude settings.

### Before launch checklist
Do these in order when the app is about to go live. The release refuses a half-finished list (`env_missing`, `environment_unprotected`, `vercel_auto_assign_on`, `deployment_protection_off`, `env_mismatch`).
1. **Production database.** Create `ezdraft-prod` in EZ Binder's Supabase organization (Supabase cloud projects, steps 1–3).
2. **Go-live switch and address.** Check that **Auto-assign Custom Production Domains** is still off, and that Vercel's Domains page shows `ezdraft.ezcontractorbinder.com` valid with a certificate.
3. **Vercel protection.** Check Settings → **Deployment Protection**: **Vercel Authentication** on with **Standard Protection**; Settings → Security: **Git Fork Protection** on (set 2026-10-19).
4. **Vercel values.** In the `ezdraft` project: Production values from `ezdraft-prod`, Preview values from `ezdraft-dev`, for every name in docs/architecture.md "Environment variables" that Vercel holds. Preview needs `EMAIL_FROM` and `SUPABASE_API_GATE_SECRET` too, and `EMAIL_TRANSPORT` = `stub`. `SUPABASE_API_GATE_SECRET` is a different secret for each project: run `node scripts/db/api-gate.mjs generate` once per project and keep the `select private.set_api_gate_hash(…)` line for item 10. Never set `EMAIL_STUB_DIR` in Vercel. Mark every secret value **Sensitive**, in `ezdraft` and in EZ Binder's project in the same team. Leave `NEXT_PUBLIC_SUPABASE_URL` and `EMAIL_TRANSPORT` plain, because the release reads them. If you switch a preview to `resend`, make a separate Resend key for it (for example `ezdraft-preview`, Sending access); never put `ezdraft-production` in Vercel Preview.
5. **Vercel token.** Account Settings → **Tokens** → Create: scope EZ Binder's team only, expiration **90 days**. Note the `ezdraft` project id and the team id.
6. **Sentry.** The steps in the Sentry section (it arrives with EZD-024).
7. **Backblaze B2.** The one-time setup in the backups section (it arrives with EZD-025): a private bucket with SSE-B2 encryption, Object Lock in Governance mode for 91 days, the lifecycle rules, and three keys: the backup key, the **release key** and the restore key. The release key works only on this bucket and on file names starting `releases/`, with `writeFiles` and `listAllBucketNames` only (Backblaze needs the second for keys limited to one bucket; it shows bucket names only). No key gets `bypassGovernance`.
8. **GitHub `release` environment.** Open it and check: deployment branches = `main` only, administrators cannot bypass. Only then add its secrets: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `TENANT1_OWNER_EMAIL` (the email you sign in with), `BACKUP_SOURCE_DB_URL` (the **Session pooler** connection string of `ezdraft-prod`, with the database password written percent-encoded: every character other than a letter, a digit, `-`, `.`, `_` or `~` becomes `%` and two hex digits, so `@` is `%40`, `:` is `%3A`, `/` is `%2F` and `%` is `%25`; a bare `@`, `:` or `/` breaks the address and can show part of the password in the release log), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`, and the backups' `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_SOURCE_SUPABASE_URL`, `BACKUP_SOURCE_SECRET_KEY`. Never as repository or organization secrets, never in Vercel's `Production` environment.
9. **First real release.** Merge the release pull request (title `Phase N: …`). Actions → **Release** must end green with `phase-N` and `released`: it saved the database, created Worth Properties and your owner account, and checked the address. If it is red, the summary names the step; fix the cause and press **Re-run jobs**. Then do the Sentry live check, run the two backup workflows by hand and do the restore drill before the first real job is entered (EZD-024, EZD-025).
10. **Token hook and gate hash on `ezdraft-prod`.** Right after the first release, do Supabase cloud projects steps 9–10 for `ezdraft-prod`: turn on the Custom Access Token hook `private.custom_access_token_hook`, and run the `select private.set_api_gate_hash(…)` line from item 4. Until then the site is up and health passes, but every signed-in request on production is refused.
11. **Delete `TENANT1_OWNER_EMAIL`** from the `release` environment. Every release summary shows `owner_email_secret_unused` until you do.
12. **Every 90 days:** make a new Vercel token and replace `VERCEL_TOKEN`. The release summary shows `vercel_token_expiring` 14 days before the old one ends.

### Each release (after launch)
Merge the pull request into `main`. That is all. Watch Actions → **Release**: green means live. Red means the live site did not change, or was put back; the summary names the step. Fix the cause (for example a missing secret), then press **Re-run jobs** on that run. Except after `release_guard_lost`: then do not re-run (Release guard below). Notices in the summary: `vercel_token_expiring` (Before launch item 12); `owner_email_secret_unused` (item 11); `previous_deployment_unknown` (automatic rollback cannot work: tell the orchestrator, and use Instant Rollback by hand if that release has a problem).

### Release guard (EZD-241)
From the second release on, while the migrations run, the release adds temporary database triggers that stop any migration that would drop or rename something the previous release still reads, even when the drop happens only because of the rows production holds. They act only on the release's own connection; afterwards the release checks that every migration it applied ran under them, and it removes them whether the migrations worked or failed. A stopped migration shows `migrate_failed` with a line starting `ezd_release_guard:` that names the object; that migration is not applied (earlier ones in the same release may be), and the live site does not change. `release_guard_failed` means the triggers could not be added; no migration ran and the live site does not change: press Re-run jobs once, and if it is red again, send the summary to the orchestrator. `release_guard_remove_failed` is the same, except that the triggers could not be removed either: they stay in the database, they act only on the release's own connection, and the next run removes them first; press Re-run jobs once, and if it is red again, send the summary to the orchestrator. `release_guard_lost` means migrations ran but the release cannot prove the triggers held while they ran; the live site does not change. Do not press Re-run jobs: a re-run would put this build live although its migrations may have removed something the previous release reads. Send the whole log to the orchestrator. Run Cloud checks J5 on `ezdraft-dev` once before launch.

### First real release
`ezdraft-prod` must exist. The release creates Worth Properties and your owner account, so do not paste `supabase/bootstrap/tenant-1.sql` into production. The address check (`scripts/hosting/check-live.mjs`) runs inside the release. Afterwards delete `TENANT1_OWNER_EMAIL` (Before launch item 11).

### Rollback
1. **Automatic.** When the checks after going live fail, the release puts the previous build back. The run is red, and the summary says `verify_failed` and that the previous build was put back.
2. **By hand** (a problem found later). In Vercel → **Deployments**, open the previous production deployment (its commit carries the previous `phase-…` tag) and use **Instant Rollback**.
3. **Leave the database alone.** Never revert, edit or delete a migration. The previous build works with the current database, because migrations add before they remove.
4. **Check.** Run `node scripts/hosting/check-live.mjs`. `/api/health` still shows the newer `schema_version`; that is expected.
5. **Fix forward.** Fix on `develop`, open a pull request to `main` and merge it; the release names it `phase-N.k`.
6. **If data was damaged, stop.** Never load a dump into production by hand. The run summary names the dump taken before the release (`releases/<tag>-<time>/`); the restore steps are in the backups section (EZD-025).

### Dumps
In B2 under `releases/`, one folder per release run. They hold client data. Object Lock keeps them at least 91 days, and the lifecycle rule deletes them after 13 weeks (set with the backups, EZD-025).

### Safety net
Agents cannot run release commands (`.claude/settings.json`, `.claude/hooks/guard-bash.mjs`). Optional lines for your own Claude settings: `Bash(node scripts/release/release*)` and `Bash(gh run rerun*)`.

## Off-site backups and restore drill (EZD-025)

Every night Actions → **Off-site backup: files** copies new and changed files of the production project to a Backblaze B2 bucket, and every Sunday Actions → **Off-site backup: database** saves a copy of the production database there. Supabase's own daily backups (kept 7 days, no files) stay the first line; these copies are the second. The restore drill proves a deleted project comes back. Agents never see the keys.

### 1. One-time setup (part of the Before launch checklist, item 7)
Nothing here is needed until launch. Until then both backup workflows end green with "backup not configured".
1. **Bucket.** Create a Backblaze B2 account and a **Private** bucket with default encryption **SSE-B2** on and **Object Lock** enabled, default retention mode **Governance**, **91 days**. Turn Object Lock on when you create the bucket (not yet checked whether B2 allows it later; see First run checks). B2 keeps every file version by default ("Keep all versions"); that should be the versioning the backups need, and they refuse to run without it.
2. **Lifecycle rules.** Add three rules on the bucket:
   - (field names as the plan gives them, not yet checked against B2; see First run checks)
   - file names starting `files/`: delete a replaced or deleted (hidden) file version **90 days** after it was replaced or deleted (`daysFromHidingToDeleting: 90`, no automatic hiding);
   - file names starting `db/`: hide each database copy **91 days (13 weeks)** after upload and delete it 1 day later (`daysFromUploadingToHiding: 91`, `daysFromHidingToDeleting: 1`);
   - file names starting `releases/` (the copies the release takes): the same rule as `db/`, 13 weeks.
   - How this fits the lock: nobody can remove a locked version before its 91 days from upload end, so every copy is kept at least 91 days. A file replaced or deleted on its first day should be removed when its lock ends (not yet checked against B2).
3. **Three keys**, each limited to this bucket; **no key gets `bypassGovernance`**:
   - the **backup** key: `listAllBucketNames`, `listBuckets`, `listFiles`, `readFiles`, `writeFiles` and `readBucketRetentions`, and **no `deleteFiles`**. The plan expects writing to be enough to mark a deleted file as hidden (not yet checked against B2; see First run checks); without `deleteFiles` it can never remove a version;
   - the **release** key: file names starting `releases/`, `writeFiles` and `listAllBucketNames` only (Before launch item 7);
   - the **restore** key: `listAllBucketNames`, `listBuckets`, `listFiles` and `readFiles` only (list and read).
4. **GitHub.** In Settings → Environments → **`release`** (main only, administrators cannot bypass; Before launch item 8 adds the secrets), make sure these eight secrets exist, with values from `ezdraft-prod` and the **backup** key: `BACKUP_SOURCE_DB_URL`, `BACKUP_SOURCE_SUPABASE_URL`, `BACKUP_SOURCE_SECRET_KEY`, `BACKUP_S3_ENDPOINT` (the bucket's S3 endpoint, `https://s3.<region>.backblazeb2.com`), `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`. Four are shared with the release. Never as a repository or organization secret, never in Vercel's `Production` environment.
5. **Your restore file.** On your PC only, make a folder **outside the repo**, for example `C:\Users\JSBis\ezdraft-secrets\`, and in it a file `restore.env` with the same eight names, using the **restore** key and the database password percent-encoded as in Before launch item 8. Never put the restore key into GitHub or into the repo folder.
6. **Keep agents out of it.** In your own Claude user settings (`~/.claude/settings.json`, permissions → deny), add a Read deny for that folder, for example `Read(//c/Users/JSBis/ezdraft-secrets/**)`.

### 2. After the first real release
Actions → **Off-site backup: files** → **Run workflow**, then the same for **Off-site backup: database**. Check that both are green. Until launch they show "backup not configured".

**First run checks.** These Backblaze B2 behaviours come from the plan and were not checked against B2 when the scripts were built. The first runs on the real bucket check them:
1. B2 answers the versioning question (`GetBucketVersioning`) with `Enabled` for a bucket that keeps all versions.
2. The backup key (with `readBucketRetentions`) can read the bucket's Object Lock settings (`GetObjectLockConfiguration`).
3. The backup key, without `deleteFiles`, can mark a deleted file as hidden (a delete marker).
4. The lifecycle rule field names in step 1.2 are the ones B2 uses.
5. Object Lock has to be chosen when the bucket is created.

If a run on a bucket set up as in step 1 ends `versioning_off`, `object_lock_off` or `hide_failed`, stop and raise a question with the code. Never give the backup key more rights (no `deleteFiles`, no `bypassGovernance`) to make it pass.

### 3. The drill
Do it after Phase 1 gives Projects and Delete, and before the first real job is entered.
1. Create a project `Restore drill <date>` and upload one file.
2. Run both backup workflows by hand.
3. Delete the project.
4. **Check the backups are current.** In your own terminal: `pnpm backup:check --env-file C:\Users\JSBis\ezdraft-secrets\restore.env`. PASS = exit 0 and `"ok":true`. If `"stale"` lists `files_stale`, the last nightly file copy did not finish in the last 26 hours; `db_dump_stale`, the last weekly database copy is 8 days old or more. Run that workflow by hand, check it is green, and run the check again.
5. With **Docker** Desktop running, in your own terminal: `pnpm backup:restore --env-file C:\Users\JSBis\ezdraft-secrets\restore.env --project <id> --record` (an absolute path outside the repo; the script refuses any other).
6. PASS = exit 0 and `"ok":true` on the last line. `--record` saves the drill, so the System status page shows it.

### 4. Restoring for real
- The scratch copy is for checking and for reading data back. Never load a dump into production by hand.
- To rebuild a lost project: create a new Supabase project, apply the migrations up to the dump's `newest_migration`, load `data.sql`, and upload the files from `files/` in the bucket. These are the same steps the script runs on the scratch copy; the checklist: 1. new project, 2. migrations, 3. `data.sql`, 4. files, 5. check the project and its files.
- The copy the release took just before a release (B2 `releases/<tag>-<time>/`, named in that release's summary) is restored with `--dump releases/<tag>-<time>/`; a dump folder on your disk with `--from-dir <folder>`.

### 5. Notes
- Dumps and files hold client data. A file deleted in EZ Draft stays in the backup for 90 days after the next nightly run notices it (never less than 91 days after it was copied, because of the lock), and every database copy for 13 weeks; after that it is gone from the backup too. Database copies hold no sign-in sessions or tokens, so a restore signs everyone out.
- Storage limits per company and reminders to delete older data come in a later ticket; their deletes follow the same 90-day rule.
- **Off-site backup: check** runs every day at 10:00 UTC and is red when the last nightly file copy did not finish in the last 26 hours or the last weekly database copy is 8 days old or more. GitHub emails you about a red run. Open the run: `backup_stale` with `files_stale` or `db_dump_stale` names the copy that is behind; run that backup workflow by hand, check it is green, then run **Off-site backup: check** by hand. `environment_unprotected` means the `release` environment's rule changed (Before launch item 8). Until launch it shows `not_configured` and stays green.
- GitHub stops scheduled workflows in a public repo after 60 days without commits, so check the last backup on the System status page.

## Cloud checks (EZD-171)

These are read-only checks that Josh runs and reports to the orchestrator; none of them changes a setting.

1. **J1, cloud database settings (a).** Once "Supabase dev migrations" has run green on `develop`: open `ezdraft-dev`, SQL Editor, New query, paste all of `supabase/checks/cloud-settings.sql` (GitHub, Raw), Run. Expect the 8 rows listed in the file, every `ok` `true`. Send the table to the orchestrator (it holds no secret). An error means "Supabase cloud projects" step 6 has not run. If a box is not where this says, look for the same words and tell the orchestrator where you found it.
2. **J2, Vercel function limits (e).** In Vercel `ezdraft`, Settings, Functions: Fluid Compute on; default Function Max Duration 300 seconds; Function CPU Standard (2 GB, 1 vCPU). Report what each shows. If a box is not where this says, look for the same words and tell the orchestrator where you found it.
3. **J3, visitor address on the live site (c).** Right after the phase 1 pull request (`Phase 1: …`, develop to main) merges to `main` and Vercel `ezdraft`, Deployments, shows that merge as the newest Production deployment with state Ready: on `https://ezdraft.ezcontractorbinder.com` sign in at `/sign-in` as yourself, open `/dev/cloud-check` (it answers only while you are signed in; signed out it shows Not Found like every other `/dev` page), copy the text, then open `https://api64.ipify.org` in the same browser. Expect `plain.vercelEnv` `production`; `plain.clientIp` = that address (for IPv6: its first four groups, then `::/64`); `withFakeHeader.clientIp` = `plain.clientIp`, not `203.0.113.9`; `plain.session` `{ signedIn: true, tenantClaim: true, gate: "accepted" }`. Then on the phone with Wi-Fi off expect a different `clientIp`. A mismatch becomes the first fix ticket of phase 2. If a box is not where this says, look for the same words and tell the orchestrator where you found it.
4. **J4, Session pooler `options` (any time).** Docker Desktop and the local stack must be running (`pnpm db:up`). In `ezdraft-dev`, Connect, Session pooler, copy the connection string and delete the `:` and the password placeholder after the user name. In Terminal run `docker exec -it -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=300s' supabase_db_ezdraft psql -W '<that string>' -At -F ' ' -c "select name, setting from pg_catalog.pg_settings where name in ('lock_timeout', 'statement_timeout') order by name;"` and type the dev database password at the `Password:` prompt (never in the command). Expect exactly the two lines `lock_timeout 5000` and `statement_timeout 300000`; any other value or an error is a mismatch. Send the two lines or the error line (no password in them). If a box is not where this says, look for the same words and tell the orchestrator where you found it.
5. **J5, release guard (EZD-241).** Any time before the first real release: open `ezdraft-dev`, SQL Editor, New query, paste all of `supabase/checks/release-guard-probe.sql` (GitHub, Raw), Run. Expect one error whose text ends with `ezd_release_guard_probe user=postgres super=false fired=on`. The file always ends in that error on purpose, so nothing it creates is kept. Any other text (for example `permission denied`, `super=true` or `fired=off`) means the release cannot guard its migrations: send the text to the orchestrator. If a box is not where this says, look for the same words and tell the orchestrator where you found it.
