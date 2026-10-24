// EZD-025 Steps 5 and 6 (vault/plans/EZD-025.md; Interface contract): pure picks over off-site keys and versions.

const DUMP_MANIFEST_RE = /^db\/(\d{8}T\d{6}Z)\/manifest\.json$/;

/** The greatest `db/<ts>/` prefix that has its `manifest.json` (written last, Step 4), else null. */
export function pickLatestDump(keys) {
  let best = null;
  for (const key of keys) {
    const m = DUMP_MANIFEST_RE.exec(key);
    if (m && (best === null || m[1] > best)) best = m[1];
  }
  return best === null ? null : `db/${best}/`;
}

/**
 * One entry per key: the newest if it is a version, else the newest version older than the newest delete
 * marker (Q-0075: hidden versions are kept 90 days). Keys with no version are absent. Returns the input objects.
 */
export function pickRestoreVersions(entries) {
  const byKey = new Map();
  for (const e of entries) {
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }
  const out = {};
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified));
    const version = sorted.find((e) => !e.isDeleteMarker);
    if (version) out[key] = version;
  }
  return out;
}
