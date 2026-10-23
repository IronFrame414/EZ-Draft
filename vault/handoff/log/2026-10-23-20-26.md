# Handoff · 2026-10-23 · build EZD-021

- Phase and stage: phase 0, Stage 3 (see vault/PROGRESS.md).
- Why the session ended: unit complete.
- Completed this session: EZD-021 done (a82762c, 1030 tests): AI client, four provider adapters, `ai_read` job, stub providers with recorded responses, network guard (live calls fail tests), `preview_ai_mode` release rule, runbook AI section. Plan re-validated first (V1-V14, no QP).
- In progress: none.
- Blocked: EZD-003 (first real release, by design); EZD-027 (Josh's Surface run).
- Questions for Josh: none blocking. To confirm: 13 fixed AI error texts (app/src/server/ai/errors.ts:7-22; only "AI key not set" is from the ticket); runbook `## AI providers (EZD-021)`.
- For Josh: when you enter AI keys in Vercel, mark the keys Sensitive but leave Preview `AI_MODE` not Sensitive (the release must read it).
- Open follow-ups: keep ANTHROPIC_CUSTOM_HEADERS, ANTHROPIC_LOG, OpenTelemetry env names unset on Vercel; @anthropic-ai/sdk pinned 1.1.0 (1.2.0 needs a pnpm-workspace list entry that EZD-000 T26 forbids); net guard covers fetch/http/https only.
- Decisions made: none new. Lesson added to vault/lessons/planner.md.
- Next unit: run next_ticket.mjs --next-unit (candidates EZD-025, EZD-031, EZD-034).
