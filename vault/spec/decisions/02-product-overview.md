# Decisions · Product overview: stack, platform, hosting, accounts, devices

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0003 | 2026-10-11 | Docker Desktop is installed on the build PC. Vercel, Supabase and Resend accounts exist, shared with EZ Binder for now. (GitHub repo, DNS, Claude API key, image-model API keys, Sentry and the backup bucket were not covered; still in `tickets/needs-from-josh.md`.) |
| Q-0015 | 2026-10-11 | Claude drafts the Terms of service in EZD-1707. Attorney review is recommended before the app takes paying customers. |
| Q-0013 | 2026-10-12 | (a): the framework default browser floor: Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 113+. |
| Q-0024 | 2026-10-12 | (a): EZ Draft's own ezdraft-dev and ezdraft-prod projects inside EZ Binder's existing Supabase organization, which is on Pro. |
| Q-0027 | 2026-10-12 | (a): Vercel Pro default function limits (300 s, 2 GB). The account is on Pro. |
| Q-0031 | 2026-10-12 | (a): the ezdraft project goes inside EZ Binder's existing Vercel team, which is on Pro. |
| Q-0033 | 2026-10-12 | (a): a one-time SQL setup file Josh pastes into each cloud project's SQL editor, typing his own email there; runbook step. No personal data committed. |
| Q-0053 | 2026-10-12 | Josh has no iPad: he uses an iPhone in the field and sometimes a Surface (believed to be a Surface Pro, to be confirmed). The full editor is built and tested for both the Surface and iPad landscape (Q-0088). iPad size: iPad Air 11-inch default, 1180 × 820. Surface Pro: about 1440 × 960 until confirmed. |
| Q-0054 | 2026-10-12 | (a): full editor from 1024 px wide; below that the phone layout. |
| Q-0088 | 2026-10-12 | Tablet targets: the full editor is built and tested for the Surface (Surface Pro, about 1440 × 960, model to be confirmed) and iPad landscape (1180 × 820). Josh uses an iPhone in the field and sometimes a Surface; the EZD-027 drawing-speed field run is on the Surface. |
| Q-0109 | 2026-10-12 | Shared Vercel team with EZ Binder; the release token is scoped to that team and expires every 90 days; all secret variables marked Sensitive. |
| Q-0110 | 2026-10-12 | The cloud dev database holds made-up test data only. |
| Q-0113 | 2026-10-12 | One Supabase project for now (dev/test). Nothing goes live until the app is mostly finished; the production project, production secrets, Sentry, Backblaze and release keys are set up from a "Before launch" checklist. Until then a merge to main releases nothing, and field checks use the develop preview. |
| Q-0123 | 2026-10-18 | (b): the domain ezdraft.ezcontractorbinder.com is already connected to the Vercel project `ezdraft` (confirmed by Josh in Vercel). Until launch a merge into `main` must not go live on it; EZD-003 Step 5 and the Before-launch order are re-validated for that. |
| Q-0177 | 2026-10-20 | EZ Draft makes a clean, measured plan the crew can build from, plus a permit set when needed; it helps clients decide on selections with AI photoreal renders of the exact items; any layout can be built or changed. Every feature is built for v1; nothing is held for v2. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0196 | 2026-10-20 | No (answer a): pricing stays in EZ Draft as the spec has it (catalog prices, render allowance, cost and sell-price permissions). Only the EZ Binder hand-off goes. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0220 | 2026-10-20 | Overrides the "Later" and "Not planned" columns of the scope table. In v1: AR viewing and editing on iPhone and iPad; IFC export; billing, paywall, seats meter and onboarding for other companies; commercial load calc and service design; visual diff when opening an old version; per-user notification settings; code editions other than FBC 9th ed. / NEC 2023. Later (v2): DWG import and export, sprinklers on the RCP, in-app LiDAR, SMS, tile cut list, Bluetooth laser pairing, photo-to-plan (assess at v2), additions and site plans, native app, point-in-time recovery. Not planned: VR. Polycam API pull is open. |
| Q-0236 | 2026-10-20 | Billing in v1 is charging companies for using EZ Draft (EZD-1711 to 1713). Client billing is not part of this system in any form; payments stay out of scope. Provider and prices: Q-0237 (open). |
