# Calculations and rules: cabinets and countertops
<!-- Moved word for word from vault/spec/sections/09-calculations-and-rules.md lines 131-142 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Cabinet rules**

- Auto-fill uses 3" increments plus fillers at walls and appliances.
- Run total vs wall length: fits when the difference after fillers and scribe is within the fit tolerance in Defaults; otherwise flagged.

**Countertop rules**

- Area per piece and total in square feet; exposed edge length in linear feet (status bar).
- Presets: Flush 0, Standard 1 1/2", Bar 10", Seating 12", Wall + backsplash. Typical ranges: seating 6"–12", regular 1"–2".
- Seating overhang beyond the support limit adds brackets to a detail and shows a notice. The limit is a company setting. Countertop documents are internal and client only, never in permit sets.
- Edge profile applies to exposed edges only; wall edges take backsplash.

