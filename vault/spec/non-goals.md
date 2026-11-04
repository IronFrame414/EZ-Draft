# Non-goals

Things agents must not build or change. A ticket or plan that touches any of these is a defect (PROCESS.md rule 13), not an initiative.

## Product scope deferred by the spec (Not in v1)

Updated from Q-0220 and Q-0236 (Josh 2026-10-20; D5 (a), Josh 2026-11-01). In v1 since Q-0220, so no longer listed here: AR viewing and editing on iPhone and iPad, IFC export, billing companies for EZ Draft (paywall, seats meter, onboarding), commercial load calc and service design, visual diff when opening an old version, per-user notification settings, code editions other than FBC 9th ed. / NEC 2023.

- DWG import and export through the paid ODA converter (v2; v1 asks for a DXF re-save).
- Sprinkler heads on the RCP (v2).
- Polycam API pull (v2; v1 imports the files the user exports from Polycam); in-app LiDAR (v2); photo-to-plan (assessed at v2).
- VR (not planned).
- Push takeoff to an EZ Binder estimate; progress check-off synced to EZ Binder.
- Client approval inside the EZ Binder client portal and e-sign through EZ Binder.
- Additions and site plans (v2).
- Importing change order cost and schedule from EZ Binder.
- Native app and direct Bluetooth laser pairing (v2; v1 uses keyboard mode).
- SMS notifications (v2).
- Tile cut list (v2).
- Point-in-time recovery backups (v2).
- Out of scope entirely (not planned for any version): new construction, commercial TI, point clouds, structural calculations, pricing engine, scheduling, payments, and client billing in any form (Q-0236).

## Process non-goals for EZ Draft

- No agent teams, dynamic workflows or nested subagents (PROCESS.md rule 15).
- No MCP servers in the build repo.
- No change to `vault/PROCESS.md` without Josh's yes in chat.
- No edit to a signed-off spec file; changes go in `vault/spec/decisions/`.
- No CI run on a push to any branch but `develop`; CI runs on every push to `develop`, on the PR to `main` and by hand (H7, Josh 2026-11-01).
- No production deploy except from `main`, which is reached only through the phase PR; it merges when the CI `gate` check passes (auto-merge, Q-0261) until Josh turns that off, then by Josh's hand.
- No code text from a code book stored in the app or the repo; rules carry the app's own wording, section numbers and a link (spec: Calculations and rules · Code check engine).
- No second copy of the spec, tickets or mockups outside `vault/`; the claude.ai documents are frozen (Q-0008).
- No NEC verification pass is expected before Phase 6; rule tickets take their numbers from the catalog's check text and keep the not-yet-verified tag.
