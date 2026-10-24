// EZD-023b Step 2 (vault/plans/EZD-023b.md): the release name. Pure; Node 22 built-ins only.
// Uses EZD-023a's tag format and order (tags.mjs) and the phase PR title `Phase N: <name>` (vault/PROCESS.md).
import { compareReleaseTags, parseReleaseTag } from './tags.mjs';

const PHASE_TITLE_RE = /^Phase (0|[1-9]\d*):/;

const releaseTagsOnly = (names) => (names ?? []).filter((n) => parseReleaseTag(n) !== null);
const highest = (names) => names.reduce((best, n) => (best === null || compareReleaseTags(n, best) > 0 ? n : best), null);

/**
 * `{ tag, resume }` or `{ code: 'not_newer' | 'no_release_name' }`.
 * - A release tag already on `sha` → that tag with `resume: true` (a re-run).
 * - A `Phase N:` title whose `phase-N` does not exist → `phase-N` when newer than every tag, else `not_newer`.
 * - Any release tag exists → the next patch of the highest one.
 * - Else `no_release_name`: the first release must come from a `Phase N:` pull request.
 */
export function releaseTagFor({ prTitle, tags, tagsOnSha }) {
  const known = releaseTagsOnly(tags);
  const onSha = releaseTagsOnly(tagsOnSha);
  const top = highest(known);

  const resumed = highest(onSha);
  if (resumed !== null) return { tag: resumed, resume: true };

  const m = PHASE_TITLE_RE.exec(prTitle ?? '');
  if (m) {
    const candidate = `phase-${m[1]}`;
    if (!known.includes(candidate)) {
      if (top === null || compareReleaseTags(candidate, top) > 0) return { tag: candidate, resume: false };
      return { code: 'not_newer' };
    }
  }

  if (top !== null) {
    const { phase, patch } = parseReleaseTag(top);
    return { tag: `phase-${phase}.${patch + 1}`, resume: false };
  }
  return { code: 'no_release_name' };
}
