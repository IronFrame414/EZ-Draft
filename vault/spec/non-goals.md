# Non-goals

Things agents must not build or change. A ticket or plan that touches any of these is a defect (PROCESS.md rule 13), not an initiative.

## Product scope deferred by the spec (Not in v1)

- DWG import and export through the paid ODA converter (v1 asks for a DXF re-save).
- IFC export.
- Billing, paywall, seats meter and onboarding for other GCs (Billing hidden for tenant 1).
- Commercial load calc and service design above residential.
- Sprinkler heads on the RCP.
- Polycam API pull (v1 is manual DXF + GLB upload); photo-to-plan and in-app LiDAR.
- AR on iPhone beyond USDZ export; VR.
- Push takeoff to an EZ Binder estimate; progress check-off synced to EZ Binder.
- Client approval inside the EZ Binder client portal and e-sign through EZ Binder.
- Additions and site plans.
- Visual diff when opening an old version (auto-diff stays v2; Rev N revision clouds and the reference DXF diff are v1).
- Importing change order cost and schedule from EZ Binder.
- Native app and direct Bluetooth laser pairing (v1 uses keyboard mode).
- SMS notifications and per-user notification settings.
- Tile cut list.
- Code editions other than FBC 9th ed. / NEC 2023 (added later as rule sets).
- Point-in-time recovery backups (added when other companies use the app).
- Out of scope entirely (not planned for any version): new construction, commercial TI, point clouds, structural calculations, pricing engine, scheduling, payments.

## Process non-goals for EZ Draft

- No agent teams, dynamic workflows or nested subagents (PROCESS.md rule 15).
- No MCP servers in the build repo.
- No change to `vault/PROCESS.md` without Josh's yes in chat.
- No edit to a signed-off spec file; changes go in `vault/spec/decisions/`.
- No CI run on a push; CI runs only on the PR to `main` and by hand.
- No production deploy except from `main`, which only Josh merges.
- No code text from a code book stored in the app or the repo; rules carry the app's own wording, section numbers and a link (spec: Calculations and rules · Code check engine).
- No second copy of the spec, tickets or mockups outside `vault/`; the claude.ai documents are frozen (Q-0008).
- No NEC verification pass is expected before Phase 6; rule tickets take their numbers from the catalog's check text and keep the not-yet-verified tag.
