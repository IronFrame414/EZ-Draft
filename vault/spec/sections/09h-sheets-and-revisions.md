# Calculations and rules: sheets and revisions
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 150-167 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Sheet set rules**

- Auto-built set, decimal numbering. Plan doc numbering: A0.0 Cover + index + key, A1.0 Existing, A2.0 Demo, A3.0 Proposed, A4.0 Interior elevations, A5.0 Details, A6.0 Reflected ceiling plan, E1.0 Electrical plan, E2.0 Panel schedule + load calc, R1.0 Finish schedule + renderings. Decided Oct 11: this plan doc set is the default; the Sheets mockup order is to be corrected.
- Scales per viewport: 1/4" = 1'-0" plans, 1/2" = 1'-0" elevations; details true scale or NTS.
- Text prints at fixed paper sizes at any scale: minimum 3/32" on 24×36; labels and dims one size up from notes.
- Line weights by role: cut heavy, beyond light, hidden dashed, dims and leaders thinnest.
- Key: the full symbol and abbreviation library is held in the system; each set shows only the symbols and abbreviations used, updated as objects are added or removed. The user chooses per set whether the key goes on every sheet or on the cover only.
- Title block: project address, parcel, owner, code edition, scope of work, revision block, a blank seal box and a separate blank department approval stamp area; logo, license and contact on/off. Permit sheets are English only.
- Issue gate: code check reviewed (fixed or noted), no red/orphan flags, title block complete.
- NTS details stamped "NTS"; typed-override dimensions underlined.
- Detail legibility warnings: leaders crossing each other, labels on linework.

**Revision rules**

- Before permit, each send to the client is "Version N". Rev 0 = first issued permit set, locked; later issues are Rev 1, 2… with no cap. Every sent version is frozen; editing continues on a working copy.
- Changes are gathered and numbered only when the set is next sent to the client or department.
- Changed objects get clouds and a delta tag automatically; revision block and log update on every sheet.

