// EZD-1993: `node scripts/check.mjs --part=<name>` runs one part of the full check, so GitHub CI can run the parts in
// parallel jobs. The step list itself stays in scripts/check.mjs; no part flag runs it (or --fast) exactly as before.
//   checks  install, database, typecheck, lint, test, scripts tests
//   e2e     install, database, build, database again, e2e (the database step comes first: the build bakes in
//           the lane stack values read after it)
// Every step of the full check is in at least one part (tested in scripts/loop/__tests__/check-steps.test.mjs).

export const PARTS = {
  checks: ['install', 'database', 'typecheck', 'lint', 'test', 'scripts tests'],
  e2e: ['install', 'database', 'build', 'database again', 'e2e'],
};

/**
 * The steps to run: all of them with no part, else the part's steps in their full-check order.
 * @template {[string, ...unknown[]]} S
 * @param {S[]} steps
 * @param {{ part?: string | null, fast?: boolean }} o
 * @returns {S[]}
 */
export function selectPart(steps, { part = null, fast = false } = {}) {
  if (part == null) return steps;
  if (!Object.hasOwn(PARTS, part)) {
    throw new Error(`unknown --part ${JSON.stringify(part)}; known: ${Object.keys(PARTS).join(', ')}`);
  }
  if (fast) throw new Error('--part and --fast cannot be used together');
  const names = steps.map(([n]) => n);
  const missing = PARTS[part].filter((n) => !names.includes(n));
  if (missing.length) throw new Error(`--part ${part} names steps the check does not have: ${missing.join(', ')}`);
  return steps.filter(([n]) => PARTS[part].includes(n));
}

/** The value of `--part=<name>` in argv, or null. Only the `=` form: a bare word is the check's folder. */
export function partArg(argv) {
  const a = argv.find((x) => x === '--part' || x.startsWith('--part='));
  if (a === undefined) return null;
  return a === '--part' ? '' : a.slice('--part='.length);
}
