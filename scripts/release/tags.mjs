// EZD-023a Step 1 (vault/plans/EZD-023a.md): release tag names and order. Node 22 built-ins only.
// `phase-<N>` is the release at the end of phase N; `phase-<N>.<k>` (k >= 1) a release Josh approves between
// phase gates (11 Operations). Tags are created only by EZD-023b's release workflow on GitHub (Q-0106).

export const RELEASE_TAG_RE = /^phase-(0|[1-9]\d*)(?:\.([1-9]\d*))?$/;

/** `phase-N` → { phase: N, patch: 0 }; `phase-N.k` → { phase: N, patch: k }; anything else → null. */
export function parseReleaseTag(name) {
  const m = RELEASE_TAG_RE.exec(name);
  if (!m) return null;
  return { phase: Number(m[1]), patch: m[2] === undefined ? 0 : Number(m[2]) };
}

/** Negative, zero or positive: by phase, then by patch. Both names must parse. */
export function compareReleaseTags(a, b) {
  const pa = parseReleaseTag(a);
  const pb = parseReleaseTag(b);
  if (!pa || !pb) throw new Error(`not a release tag: ${pa ? b : a}`);
  return pa.phase - pb.phase || pa.patch - pb.patch;
}

/**
 * Lists the repository's release tags, ascending. `git(args)` runs git and returns stdout; it is injected so
 * tests need no git process and the CLI can pass its own `-C <root>` runner.
 */
export function listReleaseTags(git) {
  const out = git(['tag', '--list', 'phase-*']);
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => parseReleaseTag(l) !== null)
    .sort(compareReleaseTags);
}

/**
 * The highest release tag, or the highest tag lower than `below` when given; null when there is none.
 * No ancestry check: tags sit on main's merge commits, not on develop (Step 1).
 */
export function previousReleaseTag(tags, below) {
  let best = null;
  for (const t of tags) {
    if (parseReleaseTag(t) === null) continue;
    if (below !== undefined && compareReleaseTags(t, below) >= 0) continue;
    if (best === null || compareReleaseTags(t, best) > 0) best = t;
  }
  return best;
}
