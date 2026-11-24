// Build files the loop writes and commits itself (scripts/loop.mjs commitBuildFiles). A merge in the main checkout
// needs them unstaged. loop.log is gitignored (*.log) and never committed: listing it made every `git add` fail with
// "pathspec 'vault/build/loop.log' did not match" (17 times since 2026-11-17, audit 2026-11-23 W8).
export const BUILD_FILES = ['vault/build/state.json', 'vault/build/set-aside.md', 'vault/build/usage.jsonl', 'vault/build/trial-report.md'];
