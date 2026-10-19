# Fix mode · 2026-10-19 · develop red (Q-0149)
Fault: scripts/tools/research.test.mjs EZD-000d T8 asserts the research store is empty; 6dc45ed adopted R-001, so develop's gate is red.
Fix: T8 checks the store contract instead (exact header, well-formed lines each backed by its R-NNN.md, no unlisted report, empty pending). Removed when committed.
