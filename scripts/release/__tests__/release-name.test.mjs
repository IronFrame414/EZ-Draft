// EZD-023b T2 (vault/plans/EZD-023b.md section 4): release names. node:test, pure. Expected values come from the
// plan's Step 2 (archived plan Step 6 step 7), tags.mjs (format and order), PROCESS.md line 264 (`Phase N: <name>`)
// and finding V2 (non-release names ignored).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../release-name.mjs');
const SHA = 'a'.repeat(40);

describe('EZD-023b release names', () => {
  test('EZD-023b T2 releaseTagFor: phase PR titles, patch releases, re-runs and refusals', async () => {
    const { releaseTagFor } = await load();
    const cases = [
      ['a', 'Phase 0: Setup', [], [], { tag: 'phase-0', resume: false }],
      ['b', 'Phase 1: Projects', ['phase-0'], [], { tag: 'phase-1', resume: false }],
      ['c', 'Fix sign-in', ['phase-0', 'phase-1'], [], { tag: 'phase-1.1', resume: false }],
      ['d', 'Fix again', ['phase-1', 'phase-1.1'], [], { tag: 'phase-1.2', resume: false }],
      ['e', 'Phase 1: Projects', ['phase-0', 'phase-1'], [], { tag: 'phase-1.1', resume: false }],
      ['f', 'Phase 1: x', ['phase-2'], [], { code: 'not_newer' }],
      ['g', 'Fix', [], [], { code: 'no_release_name' }],
      ['h', 'Phase 2: x', ['phase-0'], [], { tag: 'phase-2', resume: false }],
      ['i', 'Phase 1: x', ['phase-0', 'phase-1'], ['phase-1'], { tag: 'phase-1', resume: true }],
      ['j', 'phase 1: lower case', ['phase-0'], [], { tag: 'phase-0.1', resume: false }],
      ['k', 'Fix', ['v1', 'phase-0'], [], { tag: 'phase-0.1', resume: false }],
    ];
    for (const [id, prTitle, tags, tagsOnSha, expected] of cases) {
      const result = releaseTagFor({ sha: SHA, prTitle, tags, tagsOnSha });
      assert.deepEqual(result, expected, `(${id}) ${prTitle} with ${JSON.stringify(tags)}`);
    }
  });
});
