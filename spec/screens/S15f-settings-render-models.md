# 15f · Settings: Render models

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Choose which AI model serves each render tier, set the company render allowance in dollars, and connect the local GPU render worker.

**Entry points:** Settings nav "Render models". Owner notification "Render allowance refilled" links here.

**Permissions:** Manage users and settings. Dollar figures also need See company costs; without it they are hidden. Running renders is gated per tier by Run fast renders, Run standard renders and Run photoreal renders (on the Render screens).

**Layout:** Settings shell. Main card: Tiers (one row each), Render allowance, Local render worker.

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Tier row: Fast | Tiers | Model select; approx. cost per image in dollars. | Plan examples: Reve Edit Fast, Gemini 3.1 Flash Lite Image, GPT Image 2 low; about $0.01 to $0.04. Target under $0.25. |
| Tier row: Standard | Tiers | Model select; cost. | Gemini 3.1 Flash Image 1K, Flux Kontext pro; about $0.04 to $0.07. |
| Tier row: Photoreal | Tiers | Model select; cost. | Gemini 3.1 Flash Image 4K, Flux Kontext max, GPT Image 2 high; about $0.08 to $0.15+. Photoreal is v1 (Round 24). |
| Allowance amount ($) | Render allowance | Company render budget in dollars. | Round 24 #18. |
| Used this period ($) | Render allowance | Display: spent / allowance, progress bar. |  |
| Auto-refill amount ($) | Render allowance | Amount added when the allowance is used up. | No hard limit: renders never stop; the allowance refills and the owner is notified (Round 24). |
| Refill notification (display) | Render allowance | "Owner is notified by in-app and email on each refill." |  |
| Local worker status | Local render worker | Connected / offline, last job time. | Local GPU worker preferred; cloud API fallback when offline (Round 24 #50). |
| Use local worker first (switch) | Local render worker | On: jobs go to the worker first. | Default on (Round 24). |
| Connect worker | Local render worker | Shows a one-time worker token with Copy. |  |
| Save | Footer | Saves tiers and allowance. | Disabled with no edits. |

**Data shown:** tier → model mapping, cost per image, allowance, spend, refill amount, worker status. Render costs always in dollars.

**States:** loading, error, offline read-only, worker offline (fallback note), allowance refilled (banner with date).

**Validation & warnings:** Each tier must have a model selected. Allowance and refill amounts are positive dollar values.

**Events emitted:** render.model\_config\_updated (new); render\_allowance.refilled: amount, date, notifies owner.

**Decisions:**

1. Tiers are Fast, Standard, Photoreal; costs show in dollars, not credits (Round 24).
2. Company allowance in dollars, no hard limit, auto-refills when used up and notifies the owner; allowance and refill amount set here (Round 24).
3. Run standard renders gates the Standard tier (Round 24).
4. Waiting on: the render test (3 past jobs through 3 to 4 models) before default models per tier are chosen.
