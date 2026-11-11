# Design session brief, 2026-11-11 (boards for Q-0665 and Q-0696)

Paste everything below the line into a new Cowork design session. It draws the boards that are still owed. When Josh approves them, the orchestrator copies them into `vault/mockups/` with their wording files and the waiting tickets can be planned. Those tickets are EZD-135 and EZD-237 (System status), and EZD-105, EZD-107, EZD-129 and EZD-105b (Users page).

---

You are drawing Studio boards for EZ Draft, a remodel CAD and permit-set web app for Worth Properties. Josh Bishop, a general contractor, approves them. Ask him only about design and what the screen looks like. Use plain words; he is not a programmer.

**Match the existing boards.** The approved boards are in `/Users/josh/Projects/ezdraft/vault/mockups/`. Each has a PNG at 1600 × 1000 and an `html/project/<name>.dc.html` file with exact sizes, colors, spacing and copy. Use the same Studio shell, components, type (Instrument Sans, DM Mono), Material Symbols Outlined icons and colors. Read these before drawing:
- `S15Settings.dc.html`: the Users page you are extending (table, inspector, Roles row, left nav).
- `S15aCompany.dc.html` and `S15hLibraries.dc.html`: other Settings pages and their card style.
- `S01bWizard.dc.html`: the New project dialog, which gets a Foreman picker.
- `S03dStates.dc.html` and `S03dTablet.dc.html`: how state boards and the tablet layout are laid out.
- `S03dSelectedObjects-wording.md`: the format for a wording file.

The design canvas is https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex (vault/mockups/INDEX.md). Add the new boards on its Studio page. Boards on the Polished, Refined and Layout C pages are superseded; don't use them.

**Wording.** Put every user-visible string on the board. For each board, list them in a wording file, one row per string with an ID (W1, W2, …), as in `S03dSelectedObjects-wording.md`. Use short plain words a contractor would use. Sample data on a board is not a decision; mark it "sample".

**Decided; don't change these.**
- There are 37 permission switches in six groups: Projects 7, Renders 5, Money 5, Issue and send 4, Field 6, Admin 10 (one switch per Settings page).
- "Manage users and settings" and "Approve translations" no longer exist. Remove them from anything you redraw.
- The Users page switch controls everything on the Users page.
- Owner counts 37, Designer 26, Foreman 11, Crew 4.

## Board 1 · S15i Settings: System status (Q-0665)

Holds up EZD-135 (the page) and EZD-237 (Run benchmark on the same page).

- **Who sees it:** only users with the "System status" switch (the Owner by default). It is a Settings nav item named "System status" in the S15 left nav.
- **What it shows,** in four sections:
  1. **Job failures:** failed background jobs in the last 30 days, newest first, 50 per page. Each row shows the kind (for example Export PDF, Import scan), the project, the error message, the attempts and when it failed.
  2. **Webhook failures:** failed outgoing webhook deliveries for this company, with when, the target and the error.
  3. **Last off-site backup:** when the last nightly file copy and the last weekly database dump finished, their size and where they went. Show a warning look when the newest copy is older than its schedule (files nightly, database weekly).
  4. **Last restore drill:** when it ran and whether it passed. A failed drill shows "Failed".
- **Benchmark (EZD-237):**
  - A **Run benchmark** button opens the benchmark project and runs a scripted pan, zoom and wall drag.
  - Below it, a history list, newest first, 50 per page. Each run shows the date, device, app version, and the worst and average frame for pan, zoom and drag.
  - Mark a run that missed budget. The budget is a frame every 16 ms on desktop and 33 ms on iPad, and no frame over 100 ms.
  - Show a running state while the benchmark plays.
- **States to draw:**
  - filled (sample rows)
  - empty, for a fresh company with no failures, no backup and no drill: each section shows its own empty line, not an error
  - loading
  - error loading, with Retry
  - benchmark running
  - No-permission state is not needed, because the nav item is hidden.
- **Size:** desktop at 1600 × 1000, plus a tablet view if the layout changes there.

## Board 2 · S15j Users: Invite user dialog (Q-0696; EZD-105, EZD-138)

- Opened by the **Invite user** button on the Users page.
- **Fields:**
  - email (required)
  - name
  - role: presets first, then custom roles
  - language: English or Spanish, English by default
  - **Project access:** All projects, or Listed projects with a project picker. Foreman, Crew and custom roles default to Listed; Owner and Designer default to All.
- **Buttons:** Send and Cancel.
- **After Send** the dialog shows the invite link with **Copy link** and the 6-digit **invite code**. The invite lasts 7 days.
- **Refusals,** shown inline, with nothing sent:
  - invalid email
  - already a member or already invited here
  - email in use at another company. Never name the other company.
- **The pending row** in the table shows "Invite pending", "sent <date>" and a dashed role pill, with Resend and Cancel invite. Copy link and the code show only to the person who last sent the invite and to Owners; others see Resend, which makes them the sender.
- **Sign-in page addition:** a small "Have an invite code?" link that opens email and code fields. Five wrong codes lock the code until Resend; draw that message. Wrong email and wrong code get the same one message.
- **States:** empty dialog, filled, sending, sent (link and code shown), each refusal, and send failed with Try again.

## Board 3 · S15k Users: role editor (Q-0696; EZD-107)

- **Roles row:** cards for the presets and the custom roles, each with a name and a one-line summary. Owner "Everything, incl. users and settings"; Designer "All but delete, issue, users"; Foreman "Field, fast renders, export"; Crew "Tasks, photos, measure, flag". A **New role** card sits at the end.
- **Clicking a preset** opens its switches read-only. **Clicking a custom role** opens it for editing:
  - name
  - the 37 switches in their six groups, each group with a count and "n of 37" overall
  - Save and Cancel
  - Delete, offered only when nobody holds the role; otherwise show it disabled with the reason
- Editing a custom role changes its defaults only, not the people who already hold it. Say so in a one-line note.
- **New role:** start from scratch or from a preset. A name is required, and a duplicate name (ignoring case) is refused.
- **"Save as new role"** in the user inspector appears only when a user is "(modified)". Draw it in place.
- **States:** viewing a preset, editing a custom role with unsaved changes, name refused, delete not allowed, saving, and save failed.

## Board 4 · S15 additions: Project access picker and Set password (Q-0696; EZD-129, EZD-105b)

- **Project access control in the user inspector:** All projects or Listed projects. Listed opens a project picker with search and checkboxes, showing the project name and client. Zero listed projects is allowed; draw its note ("This person sees no projects"). This is the same control as in the Invite dialog.
- **Set password** sits in the row's More menu and as an inspector button. Only Owners see it. It generates a 16-character password, shown once with Copy, and the member is signed out everywhere and emailed. Draw:
  - the confirm step
  - the password shown once, with Copy and a "you won't see this again" note
  - the done state

## Board 5 · S01b addition: Foreman picker in the New project dialog (Q-0696; EZD-129)

- Add a **Foreman** field to the New project dialog (board S01b). It lists active members by name.
- Picking one adds the project to that person's listed projects when their access is Listed. Say so in one line.
- **States:** no foreman picked (optional), picked, and no members yet.

## When Josh approves

Export each board's PNG at 1600 × 1000, its `.dc.html` and its wording file. Tell Josh the board names so the orchestrator can copy them into `vault/mockups/` and add them to `vault/mockups/INDEX.md`.
