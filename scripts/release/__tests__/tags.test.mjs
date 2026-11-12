// EZD-023a T13 (vault/plans/EZD-023a.md section 4). node:test, Node 22 built-ins only; no git process, the
// `git` function is injected (section 3, `listReleaseTags(git)`).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../tags.mjs');

describe('EZD-023a release tags', () => {
  test('EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names', async () => {
    const { listReleaseTags, previousReleaseTag, RELEASE_TAG_RE, parseReleaseTag, compareReleaseTags } =
      await load();
    const names = ['phase-0', 'phase-1', 'phase-1.2', 'phase-10', 'phase-2', 'v3', 'phase-01', 'phase-1.0'];
    const calls = [];
    const git = (args) => {
      calls.push(args);
      return names.join('\n') + '\n';
    };
    const tags = listReleaseTags(git);
    assert.deepEqual(tags, ['phase-0', 'phase-1', 'phase-1.2', 'phase-2', 'phase-10']);
    assert.equal(calls.length, 1, 'one git call');
    assert.deepEqual(calls[0], ['tag', '--list', 'phase-*']);

    assert.equal(previousReleaseTag(tags, 'phase-2'), 'phase-1.2');
    assert.equal(previousReleaseTag(tags), 'phase-10');
    assert.equal(previousReleaseTag([]), null);
    assert.equal(previousReleaseTag(tags, 'phase-0'), null);

    // Step 1 format (section 3 RELEASE_TAG_RE / parseReleaseTag / compareReleaseTags).
    assert.equal(String(RELEASE_TAG_RE), String(/^phase-(0|[1-9]\d*)(?:\.([1-9]\d*))?$/));
    assert.deepEqual(parseReleaseTag('phase-1'), { phase: 1, patch: 0 });
    assert.deepEqual(parseReleaseTag('phase-1.2'), { phase: 1, patch: 2 });
    assert.equal(parseReleaseTag('phase-01'), null);
    assert.equal(parseReleaseTag('phase-1.0'), null);
    assert.equal(parseReleaseTag('v3'), null);
    assert.ok(compareReleaseTags('phase-2', 'phase-10') < 0, 'phase-2 before phase-10');
    assert.ok(compareReleaseTags('phase-1.2', 'phase-1') > 0, 'phase-1.2 after phase-1');
    assert.equal(compareReleaseTags('phase-1', 'phase-1'), 0);
  });

  // EZD-360 (vault/plans/EZD-360.md section 4, T6-T9): phase 56 sorts between phase 5 and phase 6 (D-Tags).
  test('EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)', async () => {
    const { compareReleaseTags } = await load();
    const sorted = ['phase-6', 'phase-56.2', 'phase-5', 'phase-56', 'phase-5.3'].sort(compareReleaseTags);
    assert.deepEqual(sorted, ['phase-5', 'phase-5.3', 'phase-56', 'phase-56.2', 'phase-6']);
  });

  test('EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)', async () => {
    const { releaseTagFor } = await import('../release-name.mjs');
    assert.deepEqual(releaseTagFor({ prTitle: 'Phase 6: x', tags: ['phase-5', 'phase-56'], tagsOnSha: [] }), { tag: 'phase-6', resume: false });
  });

  test('EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)', async () => {
    const { releaseTagFor } = await import('../release-name.mjs');
    assert.deepEqual(releaseTagFor({ prTitle: 'Phase 56: x', tags: ['phase-5'], tagsOnSha: [] }), { tag: 'phase-56', resume: false });
  });

  test('EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)', async () => {
    const { releaseTagFor } = await import('../release-name.mjs');
    assert.deepEqual(releaseTagFor({ prTitle: 'Phase 56: x', tags: ['phase-6'], tagsOnSha: [] }), { code: 'not_newer' });
  });
});
