// Tests for vault/tools/plan_lint.mjs (token diet, Josh 2026-10-22): a plan is execution-grade before a Sonnet builder
// sees it. Section 1 carries Build steps, Decided for the builder and Do not touch; no vague words; every test row has an
// expected value; no open QP questions unless --allow-questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(root, 'vault/tools/plan_lint.mjs');
const { lintPlan } = await import(pathToFileURL(TOOL).href);

const good = () => `# EZD-900 · Sample

- **ACs:** AC-EZD-900-1
- **Complexity:** medium
- **User-visible result:** the sample works.

## 1. What to build
### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | app/src/sample.ts | new | \`export function sample(n: number): string\` | app/src/other.ts | \`pnpm vitest run sample\` |
| 2 | app/src/sample.css | new | none | app/src/other.css | \`pnpm run lint\` |
### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Empty input | return "" | Q-0001 |
### Do not touch
- app/src/other.ts

## 2. Sources
Spec 04, for example the shell section.
Architecture: none beyond the core

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| export | sample | (n: number) => string |

## 4. Tests
| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| U1 | AC-EZD-900-1 | unit | 2 | "2" | Q-0001 |

## 5. Visual checklist
None

## 6. Proposed wording
None

## 7. Security review
security-review: no

## 8. Complexity and model recommendation
medium.

## 9. Dependencies
None

## 10. Open questions
None
`;

test('an execution-grade plan passes', () => {
  assert.deepEqual(lintPlan(good()), []);
});

test('a plan without the Build steps, Decided and Do not touch blocks fails on each', () => {
  const text = good().replace(/### Build steps[\s\S]*?(?=## 2\.)/, 'Steps and a file table.\n\n');
  const p = lintPlan(text).join('\n');
  assert.match(p, /Build steps/);
  assert.match(p, /Decided for the builder/);
  assert.match(p, /Do not touch/);
});

test('a build step with an empty path, signature or verify cell fails', () => {
  const text = good().replace('| 2 | app/src/sample.css | new | none | app/src/other.css | `pnpm run lint` |', '| 2 | app/src/sample.css | new |  | app/src/other.css |  |');
  const p = lintPlan(text).join('\n');
  assert.match(p, /step 2: .*Exports and signatures/);
  assert.match(p, /step 2: .*Verify with/);
});

test('vague words in sections 1, 3 and 4 fail; section 2 is not checked', () => {
  const text = good().replace('| Empty input | return "" | Q-0001 |', '| Empty input | return "" as appropriate | Q-0001 |')
    .replace('| export | sample | (n: number) => string |', '| export | sample | TBD |');
  const p = lintPlan(text).join('\n');
  assert.match(p, /section 1: vague "as appropriate"/);
  assert.match(p, /section 3: vague "TBD"/);
  assert.doesNotMatch(p, /section 2/);
});

test('a test row without an expected value fails', () => {
  const text = good().replace('| U1 | AC-EZD-900-1 | unit | 2 | "2" | Q-0001 |', '| U1 | AC-EZD-900-1 | unit | 2 |  | Q-0001 |');
  assert.match(lintPlan(text).join('\n'), /section 4: test U1 has no expected value/);
});

test('open QP questions fail unless allowed; a missing section fails', () => {
  const text = good().replace('## 10. Open questions\nNone', '## 10. Open questions\nQP-1: which colour?');
  assert.match(lintPlan(text).join('\n'), /QP-1/);
  assert.deepEqual(lintPlan(text, { allowQuestions: true }), []);
  assert.match(lintPlan(good().replace('## 9. Dependencies\nNone\n', '')).join('\n'), /section 9 missing/);
});

test('the CLI prints PLAN LINT OK or FAIL with exit 0 or 1', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-lint-'));
  writeFileSync(path.join(dir, 'ok.md'), good());
  writeFileSync(path.join(dir, 'bad.md'), good().replace('"2" | Q-0001', ' | Q-0001'));
  const ok = spawnSync(process.execPath, [TOOL, path.join(dir, 'ok.md')], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^PLAN LINT OK/);
  const bad = spawnSync(process.execPath, [TOOL, path.join(dir, 'bad.md')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^PLAN LINT FAIL/);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-244 P2: section 2 needs an Architecture line naming existing headings', () => {
  const without = good().replace('Architecture: none beyond the core\n', '');
  assert.ok(lintPlan(without).includes('section 2: no "Architecture:" line (headings beyond the core, or "none beyond the core"; EZD-244)'));
  const bad = good().replace('Architecture: none beyond the core', 'Architecture: No such heading');
  assert.ok(lintPlan(bad, { headings: ['Tests'] }).includes('section 2: Architecture section "No such heading" is not a heading in docs/architecture.md'));
  const fine = good().replace('Architecture: none beyond the core', 'Architecture: Tests');
  assert.deepEqual(lintPlan(fine, { headings: ['Tests'] }), []);
});
