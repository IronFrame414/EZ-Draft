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
