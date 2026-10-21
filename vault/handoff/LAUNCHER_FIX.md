# Fix mode: release tag fetch in shallow CI clones (2026-10-21)

Fault: in GitHub Actions (shallow checkout) `git fetch --no-tags --depth=1 origin +refs/tags/phase-*:refs/tags/phase-*` exits 1 when origin has no phase-* tag, so scripts/release/check-migrations.mjs reports M0 and the CI gate fails at lint (run 39522218868). Q-0240. Touches scripts/release/check-migrations.mjs, its tests, docs/architecture.md.
