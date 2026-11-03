# Data model: comparison tolerance and stored lengths

Added by spec-check 3 (Q-0493; calc-auditor, 2026-11-02). Worked examples for Architecture rule 5 (`03b-architecture-rules.md`). No new rule beyond the two marked *settled here*.

**Statement.** Coordinates are stored as decimal inches and are not rounded when stored. Two coordinates are equal when the difference between them is 1/64 inch (0.015625) or less (*settled here*: inclusive). This tolerance is fixed; it is not the owner's Measurement tolerance in Defaults, which covers scan against typed values, field measurements and the closure check (S15d Defaults; Round 24 #30). Rule 5 is later than 13a's "every tolerance is a company setting" and says "fixed", so it governs.

**Typed lengths.** A typed length is turned into decimal inches at the nearest 1/16 inch when it is read; a value exactly halfway between two sixteenths goes up to the larger (*settled here*). Computed coordinates (a stretched wall, an angled wall, an imported point) are not rounded. Display rounds to the drawing's precision (plans 1/2", details 1/16"; 09e) and never changes the stored value.

**Why inclusive is safe.** 1/64 = 2^-6 is stored exactly in a double, and every value on the 1/64 grid (every typed 1/16 value included) is exact up to about 1.4 × 10^14 inches, so a difference of exactly 1/64 always compares the same way. Tests at the exact boundary use grid values only; for arbitrary computed values a difference written as "a + 1/64" can come out a hair over.

**Worked examples** (decimal inches)

| # | Case | a | b | Difference | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | Zero | 48.0 | 48.0 | 0 | Equal |
| 2 | Exactly the tolerance | 48.0 | 48.015625 | 0.015625 | Equal |
| 3 | Just over | 48.0 | 48.0157 | 0.0157 | Not equal |
| 4 | Large coordinate (100 ft), at the tolerance | 1200.0 | 1200.015625 | 0.015625 (exact: 1200.015625 × 64 = 76,801) | Equal |
| 5 | Large coordinate, just over | 1200.0 | 1200.0157 | 0.0157 | Not equal |

| # | Typed | Stored | Shown on a detail (1/16") | Shown on a plan (1/2") |
| --- | --- | --- | --- | --- |
| 6 | 10' 3 5/16" | 123.3125 | 10' 3 5/16" | 10' 3 1/2" |
| 7 | 150.03" | 150.0 (nearest 1/16) | 12' 6" | 12' 6" |
| 8 | 150.03125" (exactly halfway, 1/32) | 150.0625 (halfway goes up) | 12' 6 1/16" | 12' 6" |
| 9 | 0" | 0.0 | 0" | 0" |
