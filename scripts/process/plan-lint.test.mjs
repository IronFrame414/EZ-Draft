// Tests for vault/tools/plan_lint.mjs (token diet, Josh 2026-10-22): a plan is execution-grade before a Sonnet builder
// sees it. Section 1 carries Build steps, Decided for the builder and Do not touch; no vague words; every test row has an
// expected value; no open QP questions unless --allow-questions.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = path.join(root, 'vault/tools/plan_lint.mjs');
const { lintPlan, templateVersion, V2_BLOCKS } = await import(pathToFileURL(TOOL).href);

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

// EZD-382: template v2 (plan section 4, V1 to V12). Expected texts are D-Texts of vault/plans/EZD-382.md.
const sha = (x) => createHash('sha256').update(x).digest('hex');
const sub = (text, from, to) => {
  assert.ok(text.includes(from), `fixture edit: "${from}" not found`);
  return text.replace(from, to);
};
const MARKER = '- Template: v2';
const ROWS = {
  'Behaviour per role': ['AC, Role, Behaviour', '| AC-EZD-900-1 | owner | sees "2" |'],
  'Failure and edge cases': ['Function or action, Case, Behaviour, What the user sees', '| sample | empty input | returns "" | nothing shown |'],
  'Database columns': ['Table, Column, Type, Null, Default, Check, Upper bound', '| drawings | page_count | integer | not null | 0 | page_count >= 0 | 1000 |'],
  'RLS policies': ['Table, Command, Policy text, Tenant and role checks', '| drawings | select | tenant_id = current_tenant() | tenant |'],
  Grants: ['Object, anon, authenticated, service_role', '| drawings | none | select | all |'],
  'Database functions': ['Function, Signature, Security definer, Checks inside', 'None: no function'],
  Migrations: ['Migration file, Order, Type regeneration, Backfill', 'None: no migration'],
  Connections: ['Kind, Name, File:line, What changes', '| caller | other.ts | app/src/other.ts:12 | calls sample |'],
  'Shared lists': ['List, Test file, Current value, New value', 'None: no pinned list'],
  'Data flow': ['Hop, From, To, Exact name', 'None: no API hop'],
  'Live site': ['Database object, Main\'s caller, How main keeps working', 'None: no database change'],
  Tests: ['Test, AC, Type, Input, Expected value, Source of the expected value, Fixture, Wait method, Gate scope, CI', '| U1 | AC-EZD-900-1 | unit | 2 | "2" | Q-0001 | inline | none | unit | no |'],
  'Regression list': ['Test file, Test name, Why', 'None: no shared test'],
  'Component tree': ['Component, New / change, Copies, Parent', '| Sample | new | Other | Shell |'],
  'Screen states': ['Screen, State, Mockup, What shows', '| sample | empty | S01 | blank |'],
  Interactions: ['Control, Input, Behaviour, Drag threshold, Size and position, Tap area', '| Rail button | touch | opens panel | 4 px | 32 × 32 px at top left | 44 × 44 px |'],
  Neighbours: ['Element, Owner ticket, How it sits', 'None: no neighbour'],
  Viewports: ['Viewport, Size, Applies', '| desktop | 1600 × 1000 | yes |'],
  Risks: ['Risk, What could break, Gate notices it, Covered by', '| slower lint | none | yes | V3 |'],
};
// D-Blocks order: section, title
const ORDER = [[1, 'Behaviour per role'], [1, 'Failure and edge cases'], [1, 'Database columns'], [1, 'RLS policies'], [1, 'Grants'], [1, 'Database functions'], [1, 'Migrations'],
  [3, 'Connections'], [3, 'Shared lists'], [3, 'Data flow'], [3, 'Live site'], [4, 'Tests'], [4, 'Regression list'], [5, 'Component tree'], [5, 'Screen states'],
  [5, 'Interactions'], [5, 'Neighbours'], [5, 'Viewports'], [9, 'Risks']];
const blockText = (title) => {
  const [cols, row] = ROWS[title];
  const c = cols.split(', ');
  return `### ${title}\n| ${c.join(' | ')} |\n| ${c.map(() => '---').join(' | ')} |\n${row}\n`;
};
const blocksFor = (n) => ORDER.filter(([s]) => s === n).map(([, t]) => blockText(t)).join('');
const goodV2 = () => {
  let t = sub(good(), '- **User-visible result:** the sample works.\n', `- **User-visible result:** the sample works.\n${MARKER}\n`);
  t = sub(t, '- app/src/other.ts\n', `- app/src/other.ts\n${blocksFor(1)}`);
  t = sub(t, '| export | sample | (n: number) => string |\n', `| export | sample | (n: number) => string |\n${blocksFor(3)}`);
  t = t.replace(/## 4\. Tests\n[\s\S]*?(?=## 5\.)/, `## 4. Tests\n${blocksFor(4)}\n`);
  t = sub(t, '## 5. Visual checklist\nNone\n', `## 5. Visual checklist\n${blocksFor(5)}`);
  t = sub(t, '## 9. Dependencies\nNone\n', `## 9. Dependencies\nNone\n${blocksFor(9)}`);
  return t;
};
const missingLine = ([n, title]) => `section ${n}: no "### ${title}" table (template v2)`;
const GAP = 'section 3: Connections names PLAN-GAP: give each connection its file:line from a grep at develop HEAD';

test('EZD-382 V1 every current plan lints as before the change', () => {
  const fx = JSON.parse(readFileSync(path.join(root, 'scripts/process/fixtures/plan-lint-v1-baseline.json'), 'utf8'));
  let compared = 0;
  for (const [name, e] of Object.entries(fx.plans)) {
    const file = path.join(root, 'vault/plans', name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (sha(text) !== e.text) continue;
    const problems = lintPlan(text, { headings: fx.headings });
    assert.equal(sha(JSON.stringify(problems)), e.result, `${name}: lint result changed`);
    assert.equal(problems.length, e.count, `${name}: problem count changed`);
    compared++;
  }
  assert.ok(compared >= 1, 'no baseline entry was compared');
});

test('EZD-382 V2 the marker counts only in the header', () => {
  const inSection2 = sub(good(), 'Architecture: none beyond the core\n', `Architecture: none beyond the core\n${MARKER}\n`);
  assert.deepEqual(lintPlan(good()), []);
  assert.deepEqual(lintPlan(inSection2), []);
  assert.equal(templateVersion(good()), 1);
  assert.equal(templateVersion(inSection2), 1);
  assert.equal(templateVersion(goodV2()), 2);
});

test('EZD-382 V3 a v2 plan with every table passes', () => {
  assert.equal(templateVersion(goodV2()), 2);
  assert.equal(V2_BLOCKS.length, 19);
  assert.deepEqual(lintPlan(goodV2()), []);
});

test('EZD-382 V4 a marked plan without the v2 tables fails once per table', () => {
  const text = sub(good(), '- **User-visible result:** the sample works.\n', `- **User-visible result:** the sample works.\n${MARKER}\n`);
  const p = lintPlan(text);
  assert.deepEqual(p, ORDER.map(missingLine));
  assert.equal(p[0], 'section 1: no "### Behaviour per role" table (template v2)');
  assert.equal(p[18], 'section 9: no "### Risks" table (template v2)');
});

test('EZD-382 V5 an empty v2 table needs None with a reason', () => {
  const row = ROWS.Grants[1];
  const noRows = 'section 1: Grants table has no rows (write "None: <reason>" when there is nothing)';
  const noReason = 'section 1: Grants: "None" needs a reason ("None: <reason>")';
  assert.deepEqual(lintPlan(sub(goodV2(), `${row}\n`, '')), [noRows]);
  assert.deepEqual(lintPlan(sub(goodV2(), row, 'None: no grants')), []);
  assert.deepEqual(lintPlan(sub(goodV2(), row, 'None')), [noReason]);
  assert.deepEqual(lintPlan(sub(goodV2(), row, 'None:')), [noReason]);
});

test('EZD-382 V6 a v2 table without its columns fails', () => {
  assert.deepEqual(lintPlan(sub(goodV2(), 'Gate notices it', 'Notes')), ['section 9: Risks table lacks column(s) Gate notices it']);
});

test('EZD-382 V7 PLAN-GAP in Connections fails', () => {
  assert.deepEqual(lintPlan(sub(goodV2(), 'app/src/other.ts:12', 'Others: PLAN-GAP')), [GAP]);
  assert.deepEqual(lintPlan(sub(goodV2(), 'app/src/other.ts:12', 'plan-gap')), [GAP]);
});

test('EZD-382 V8 an integer column needs an upper bound', () => {
  const row = ROWS['Database columns'][1];
  const line = (type) => `section 1: Database columns: drawings.page_count (${type}) has no upper bound (L-061)`;
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('| 1000 |', '| none |'))), [line('integer')]);
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('| 1000 |', '| none |').replace('integer', 'bigint'))), [line('bigint')]);
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('| 1000 |', '| none |').replace('integer', 'text'))), []);
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('| 1000 |', '| 2147483647 |').replace('integer', 'int4'))), []);
});

test('EZD-382 V9 an interaction row needs a tap-area size', () => {
  const row = ROWS.Interactions[1];
  const line = 'section 5: Interactions: Rail button / touch has no tap-area size in px (44 px rule)';
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('44 × 44 px', 'large'))), [line]);
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('44 × 44 px', '44px'))), []);
  assert.deepEqual(lintPlan(sub(goodV2(), row, row.replace('| 44 × 44 px |', '|  |'))), [line]);
});

const withMigrations = (fn) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-mig-'));
  try {
    writeFileSync(path.join(dir, '20261110120000_a.sql'), '-- a\n');
    writeFileSync(path.join(dir, '20261110130000_b.sql'), '-- b\n');
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const migRow = (cell) => `| ${cell} | 1 | no | none |`;

test('EZD-382 V10 a new migration sorts after the newest', () => {
  withMigrations((dir) => {
    const none = ROWS.Migrations[1];
    const run = (name) => lintPlan(sub(goodV2(), none, migRow(`supabase/migrations/${name}`)), { migrationsDir: dir });
    assert.deepEqual(run('20261110125959_x.sql'), ['section 1: Migrations: 20261110125959_x.sql does not sort after the newest migration 20261110130000_b.sql (L-060)']);
    assert.deepEqual(run('20261110130001_x.sql'), []);
    assert.deepEqual(run('20261110130000_b.sql'), []);
  });
});

test('EZD-382 V11 a migration row without a file name or folder fails', () => {
  withMigrations((dir) => {
    const none = ROWS.Migrations[1];
    assert.deepEqual(lintPlan(sub(goodV2(), none, migRow('add a table')), { migrationsDir: dir }), ['section 1: Migrations: row 1 names no <YYYYMMDDHHMMSS>_<name>.sql file']);
    const missing = path.join(dir, 'no-such-folder');
    assert.deepEqual(lintPlan(sub(goodV2(), none, migRow('20261111000000_x.sql')), { migrationsDir: missing }), [`section 1: Migrations: no migrations folder at ${missing} (L-060)`]);
  });
});

test('EZD-382 V12 the CLI applies the v2 rules to a marked file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-lint-v2-'));
  try {
    const ok = path.join(dir, 'ok.md');
    const bad = path.join(dir, 'bad.md');
    writeFileSync(ok, goodV2());
    writeFileSync(bad, sub(goodV2(), 'app/src/other.ts:12', 'Others: PLAN-GAP'));
    const a = spawnSync(process.execPath, [TOOL, ok], { encoding: 'utf8' });
    assert.equal(a.status, 0, a.stdout);
    assert.equal(a.stdout.trim(), `PLAN LINT OK ${ok}`);
    const b = spawnSync(process.execPath, [TOOL, bad], { encoding: 'utf8' });
    assert.equal(b.status, 1);
    const lines = b.stdout.trim().split('\n');
    assert.deepEqual(lines, [`PLAN LINT FAIL ${bad} (1)`, `- ${GAP}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
