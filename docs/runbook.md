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
