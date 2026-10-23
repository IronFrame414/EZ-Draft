# Runbook

## Vercel and the subdomain (EZD-003)

Josh's steps in Vercel and at the DNS host. All are done; this is the record. Agents never change Vercel or DNS settings.

1. **Create the project** (done Oct 12). In EZ Binder's Vercel team: Add New, Project, import `IronFrame414/EZ-Draft`, name it `ezdraft`, Framework Next.js, Root Directory `app` (or later Settings, Build and Deployment, Root Directory). Leave "Include files outside the root directory" on. The first production build of `main` fails until the Phase 0 merge; that is expected.
2. **Build and branch settings** (done 2026-10-19).
   - Production Branch is `main`.
   - Settings, Build and Deployment, **Ignored Build Step**, option Custom, with exactly: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1`. Production builds only from `main`, the phase PR builds a preview, a plain `develop` push builds nothing.
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
4. **Vercel values (Production).** In the `ezdraft` project: Settings, Environment Variables, Production. `EMAIL_TRANSPORT` = `resend`. `EMAIL_FROM` = `EZ Draft <no-reply@ezcontractorbinder.com>`. `RESEND_API_KEY` = the key from step 3, marked Sensitive. The Preview values come with the environments setup (EZD-023b): `EMAIL_TRANSPORT` = `stub`, so previews email nobody and the sender gets the link from Copy link. If you later switch a preview to `resend`, it emails the real addresses in the dev data.
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

## Background jobs (EZD-009)

Josh's steps in Vercel. The once-a-minute sweep picks up jobs that are waiting to retry or whose run died. Vercel runs cron jobs on production deployments only, so previews get no sweep. The `ezdraft` project sits in EZ Binder's Vercel team, which is on Pro, so a cron every minute is allowed. Agents never change Vercel settings. Never paste the secret into chat, a ticket or the repo.

1. **Cron secret.** In Vercel, open the `ezdraft` project, then Settings, Environment Variables. Add `CRON_SECRET` for Production only, marked Sensitive. The value is a random string of at least 32 characters (for example from a password manager's generator). Vercel sends it with every cron request, and the sweep refuses any request without it.
2. **Check the cron (after the Phase 0 merge).** In the `ezdraft` project, open Settings, Cron Jobs. It lists `/api/jobs/sweep` with the schedule `* * * * *` (every minute). If it is missing, or Vercel says the plan does not allow it, tell the orchestrator before changing anything.
