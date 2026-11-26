// EZD-1948 (audit 2026-11-23 P4): builders spent their 90 minutes rerunning the whole gate (22 'builder timed out after
// 90 min' in the audit window). The builder and every fix round now run only typecheck, lint and the tests of the files
// they changed (or the failing tests), and run node scripts/check.mjs at most once, at the end. The loop runs the full
// check itself after every builder and fix round, so that one run is a courtesy, not the gate.

// How to run the tests of one changed file, by where it lives.
export const TARGETED_COMMANDS = [
  'typecheck: `pnpm typecheck`',
  'lint: `pnpm lint`',
  'app unit test: `pnpm --filter app exec vitest run <file>`',
  'app e2e spec: `pnpm --filter app exec playwright test <spec>`',
  'geometry test: `pnpm --filter @ezdraft/geometry exec vitest run <file>`',
  'scripts test: `node --import ./app/test-harness/net-guard/preload.mjs --test <file>`',
].join('; ');

export const CHECK_AT_MOST_ONCE = 'Run `node scripts/check.mjs` (with or without --fast) at most once, at the end, when the targeted runs pass; the loop runs the full check itself after you finish, so do not rerun it to prove stability or timing.';

// Step 3 of the builder prompt.
export const BUILDER_TEST_STEP = `3. While you work, run typecheck, lint and the unit and e2e tests of the files you changed (and the tests that cover them), not the whole suite (${TARGETED_COMMANDS}). ${CHECK_AT_MOST_ONCE}`;

// The test rule appended to every fix-round prompt (check, review, merge).
export const FIX_TEST_RULE = `While you fix, run typecheck, lint and the failing tests (and the tests of the files you change), not the whole suite (${TARGETED_COMMANDS}). ${CHECK_AT_MOST_ONCE}`;

// The fix-round prompt for a red check, a failing review or a merge conflict (moved here from loop.mjs to be testable).
export function fixPromptBody(kind, detail, typesFile) {
  if (kind === 'merge') return `develop moved while you worked (another lane merged). \`git merge develop\` stopped on conflicts in this folder; the conflicted files are below. Resolve every conflict keeping both changes' intent (${typesFile} is not in the list: the loop regenerates it after the merge, so leave it as it is), commit the merge, fix anything the merge broke, and commit. ${FIX_TEST_RULE} The claim rules from the start still hold.\n\n${detail.slice(0, 6000)}`;
  return kind === 'check'
    ? `The full check (node scripts/check.mjs) failed after your work. The failing lines are below; the full output is in check.log in this folder. Fix the cause (do not weaken tests) and commit. ${FIX_TEST_RULE}\n\n${detail.slice(0, 9000)}`
    : `An independent reviewer found blocking problems. Fix each one and commit. ${FIX_TEST_RULE} If you believe a finding is wrong, say why in one line instead of changing code.\n\n${detail}`;
}
