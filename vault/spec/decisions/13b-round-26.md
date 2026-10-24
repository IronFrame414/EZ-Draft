# Decisions · Round 26 (build-readiness audit, Oct 11)

Part of the spec's section 13 (`vault/spec/sections/13-decisions-and-remaining-items.md`), exported Oct 11, 2026 and read-only. Authority: Round 26 > Round 25 > Round 24; a build-time answer (the other files in this folder) overrides all three where it names the same thing.

**Round 26: build-readiness audit (Oct 11)**

Josh's answers are marked Josh; the rest were decided by Claude at Josh's direction to resolve every audit item. These override anything earlier in this spec.

| # | Decision |
| --- | --- |
| R1 | The browser never reads or writes tables directly; all access goes through server routes that check permissions, with row-level security as the backstop. Money fields are kept separate so who sees them is one setting. See Data model, Architecture rules 1 and 2. (Claude) |
| R2 | Money has two permissions (Josh): See company costs covers what the company pays (catalog cost, takeoff and order-line costs, option cost lines, change-order cost deltas, render cost and allowance dollars); See sell prices covers what the client is charged (sell price, markup, allowance amounts, edge-profile price differences, change-order overhead, profit and total). Owner and Designer have both; Foreman and Crew have See company costs only. This replaces the single See costs and prices permission everywhere. |
| R3 | Everything that prints on a sheet or is in a signed package is versioned with the model in v1: sheets, viewports, countertops, panel and circuits, detail instances, option changes. (Josh) |
| R4 | The model schema is defined once, versioned, validated on every save and upgraded on read. (Josh: build it) |
| R5 | Saves carry a lock generation and checkpoints are built on the server, so a sleeping device cannot save over the next editor. A non-holder may send from a server checkpoint with a notice. (Claude) |
| R6 | One device outbox from Phase 1; offline is the same save path. When synced changes conflict with what another user did to the same object, the user gets a notification and resolves each with Keep mine or Keep theirs. (Josh) |
| R7 | One drawing list feeds the plan canvas, the on-screen sheet and the PDF; PDFs are written with PDFKit. Proven by a Phase 0 spike before any sheet work. (Claude, at Josh's direction) |
| R8 | Calculations run in the browser while editing and are re-run on the server at send or issue. See Where each output is produced. (Claude) |
| R9 | Five throwaway spikes run right after Phase 0 (EZD-027 to EZD-031): the plan canvas with a 150,000-entity drawing on the iPad, the PDF path, the DXF parser on a real architect file, wall openings with a sloped ceiling, and a render trial. Each ends in a go or no-go note. (Claude) |
| R10 | CI gates on counts that need no GPU; Josh runs the benchmark page on the iPad at each field check. (Claude) |
| R11 | Named tools and a conventions file (EZD-000) that every build session reads. (Claude) |
| R12 | Environments, promotion-only production releases, add-before-remove migrations, Sentry, a System status page. (Claude) |
| R13 | Stored files are backed up nightly to a second provider; the restore drill runs before the first real job. (Claude) |
| R14 | Client link: server routes with a field list, private files, hashed tokens, rate limits. The signer check stays as Round 24 #32 with an attempt limit. A 6-digit emailed code at signing remains an option if stronger proof is wanted. (Claude) |
| R15 | Crew sign-in email carries a link and a 6-digit code, because a link opened from email does not sign in the installed app on iPad or iPhone. The EZ Binder sign-on exchange is a single-use 60-second code swapped on the server for a session, defined in the contract. (Claude) |
| R16 | DXF: one parser for imports and references, chosen in the spike; unsupported entity types are counted and shown per reference as "N entities of type X not drawn". The promise is all supported entity types, not 100% of every file. (Claude) |
| R17 | Interface language: the field pack and the other phone screens for crew are available in Spanish, buttons and messages included; the office editor and the client link are English in v1. Every interface string goes through one message helper from Phase 0. (Claude) |
| R18 | The cloud render API is the primary path until the GPU test passes; the local worker protocol is still built in Phase 11, with its own revocable key. This narrows Round 24 #50, which stays the goal. (Claude) |
| R19 | Code check covers every building code relevant to what is drawn: the 2023 NEC and the Florida Building Code, Residential, as rule sets in Calculations, with more volumes added the same way. Rules are written in our own words with section numbers and links to the publishers' free viewers; code text is not copied. Every rule is unverified until a licensed person checks it. (Josh for the scope; Claude for the method and the rule list) |
| R20 | Voltage-drop formula, the load calc worked example, the five load calc cases and the takeoff formulas are in Calculations. (Claude) |
| R21 | First image-model adapter: Google's Gemini image-editing API; a second adapter (OpenAI image edits) is a follow-up ticket. Model per tier is still chosen by test (Round 24 #49). (Claude) |
| R22 | Option cost lines are typed by the user, as for change orders (Round 24 #25). Option A is the current design; B and C start as copies. (Claude) |
| R23 | Cabinet seed line until a real vendor line is entered: B, DB, SB and W in 3" steps from 9" to 36", fillers 3" and 6". (Claude) |
| R24 | Interior elevations are generated for every wall that hosts a cabinet, fixture or tile shower; any other wall is added with Add elevation. (Claude) |
| R25 | A non-Polycam DXF layer is converted with the same detector as Polycam imports, after the user maps layers to walls, doors and windows. (Claude) |
| R26 | Saved groups other than cabinets are placed from a Saved section in the Fixtures panel. (Claude) |
| R27 | The job-feed ticket is removed; EZ Binder gets notifications through the existing events. (Claude) |
| R28 | Scope of work is a project field entered in the New project wizard and Project settings; it prints in the title block. (Claude) |
| R29 | The client allowance summary moves to Phase 16, where allowance categories exist. (Claude) |
| R30 | A browser path-traced image is saved as a Photoreal render at cost $0 that needs review. (Claude) |
| R31 | The architect's revision letter is typed at upload, prefilled with the next letter. The Foreman who gets a field-measure link is picked in the wizard. (Claude) |
| R32 | The EZ Binder webhook address, signing secret and inbound key are entered at Connect in Settings. (Claude) |
| R33 | A dependency on a split ticket's base number (EZD-120) means all of its lettered parts. (Claude) |
| R34 | The code check uses the full Code rules catalog, not a short list: 1,248 rules across the Florida Building Code volumes and the NEC, each Automatic, Needs data or Reminder, with sections for both editions. The catalog file in the repo is the source of truth; tickets EZD-611b to EZD-639 build it, and EZD-620 adds the project and object values the rules need. (Josh for the scope; Claude for the catalog) |
