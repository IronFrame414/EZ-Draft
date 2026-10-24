# Decisions · Hooks, events, jobs and outside services: email, jobs, EZ Binder, AI and render providers

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0016 | 2026-10-11 | R21 provider choice: the render spike (EZD-031) runs the same 5 rooms through Gemini image, GPT Image 2 and Flux Kontext pro, records the cost per render and keeps the output images. Josh picks the provider from those images. |
| Q-0035 | 2026-10-12 | (b): send from EZ Binder's verified ezcontractorbinder.com for now. Also: everything that sends an email must also generate and show the sender a link they can copy and paste, because emails still land in spam. Exception (orchestrator note, for security): sign-in emails cannot show their link on screen, since anyone who typed an email would get in; the sign-in page tells the user to check spam and accepts the 6-digit code. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0036 | 2026-10-12 | (b) with a change: the sender shows as "<Company> via EZ Draft"; replies go to a company email address set in company settings (where all responses to the company are received), not to the individual sender. [Josh answered with the batch file's letter (a); this is option (b) in the question above.] |
| Q-0041 | 2026-10-12 | Build both modes, chosen per environment: previews default to the stub transport now (no paid accounts); a setting can switch a preview to live sending later if Josh allows small tests. |
| Q-0059 | 2026-10-12 | (a): up to 5 tries per job step, waiting 1, 2, 4 and 8 minutes; paid kinds may set fewer in their own tickets. |
| Q-0067 | 2026-10-12 | (b): failed-job and failed-webhook emails also go to the Owner(s) of that job's company; errors with no company go to the single ALERT_EMAIL_TO address. |
| Q-0068 | 2026-10-12 | (a): one email per failed job and per failed webhook delivery, at most 20 alert emails per rolling hour. |
| Q-0076 | 2026-10-12 | Deferred: Josh decides which accounts serve Gemini and Flux after testing the top options; the live render trial moves to after Phase 10 (Q-0082). EZD-021 builds the adapters with the endpoint configurable. |
| Q-0077 | 2026-10-12 | Build both modes, chosen per environment: previews default to AI_MODE=stub now (no paid accounts); a setting can switch a preview to live later if Josh allows small tests. |
| Q-0078 | 2026-10-12 | (a): EZ Binder keeps each EZ Draft project id and opens that project; with only a job id, EZ Draft shows that job's projects. |
| Q-0081 | 2026-10-12 | (a): EZ Binder asks for the project type and sends it; type is required in the contract. |
| Q-0082 | 2026-10-12 | Deferred: the live render trial runs after Phase 10, using the app's real 3D views. EZD-031 closes in Phase 0 on its stub run; the provider pick (R21) is needed before Phase 11. |
| Q-0083 | 2026-10-12 | (a): fixed opening sentence plus one or two sentences from Josh per room on finishes. |
| Q-0084 | 2026-10-12 | Deferred: Josh chooses models and settings when he runs the trial (after Phase 10); the script lets him pick at run time. |
| Q-0190 | 2026-10-20 | No EZ Binder connection in v1; the connector is built later together with the EZ Binder side (BACKLOG.md). Projects and clients are entered in EZ Draft. EZ Draft offers a downloadable "Scope PDF" (written scope plus before/after drawings or renders, from any revision or design option) that Josh attaches to an estimate or change order in EZ Binder. (Round 1; vault/spec/sections/00-job-stories.md) |
| Q-0082 (prep C15) | 2026-10-20 | Applies Q-0082 to `13-decisions-and-remaining-items.md:172`: the first image-model provider is confirmed at the live render trial after Phase 10 of the spec (the render phases of PHASES.md), not at the render trial spike. |
| Q-0222 | 2026-10-20 | EZD-019 (EZ Binder contract and stub) is removed from v1 with the EZ Binder connector (Q-0190); it goes to BACKLOG.md. |
| Q-0276 | 2026-10-24 | (a): 60 error-tunnel events per address per rolling hour, then 429. |
| Q-0278 | 2026-10-24 | (b): browser and worker alerts use at most 10 of the 20 alert emails per hour, so server errors, failed jobs and failed deliveries always have room. |
| Q-0287 | 2026-10-24 | (a): the preview email stub outbox keeps at most 100 messages, dropping the oldest. |
