## Not in v1

These items are deferred by the spec. No ticket covers them.

**Q-0220 (Josh, 2026-10-20) moved some of these into v1** (AR viewing and editing, IFC export, billing and onboarding for other companies, commercial load calc, visual diff of old versions, per-user notification settings, other code editions; tickets EZD-139, 140, 642, 643, 1018 to 1021, 1711 to 1713) **and removed VR entirely.** The rest stays out of v1; Polycam API pull is undecided. See vault/spec/decisions/02-product-overview.md Q-0220.

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
