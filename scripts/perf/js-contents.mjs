// EZD-020 Step 5 (vault/plans/EZD-020.md): collector for the `entry-contents:<entry>` measurements. Collects an
// entry's scripts exactly as js-size.mjs does, attributes their bytes to sources through their source maps and
// counts the forbidden categories of eslint-rules/boundaries.mjs ENTRY_RULES. Never passes silently: a file
// without a map, or an entry with no app source, is an error. Bytes are minified bytes, not compressed bytes.
import { Buffer } from 'node:buffer';
import {
  EDITOR_CODE,
  ENTRY_RULES,
  HEAVY_PACKAGES,
  LAZY_ROOT,
  WATCH_PACKAGES,
  findHeavy,
  matchesName,
} from '../../eslint-rules/boundaries.mjs';
import { collectScripts } from './js-size.mjs';
import { attribute, groupKey, normalizeSource } from './sourcemap.mjs';

const MAP_COMMENT = /\/\/# sourceMappingURL=(\S+)/g;
const DATA_MAP = 'data:application/json;base64,';

/** `app/src/<p>` as an `app:` key prefix. */
const appForm = (prefix) => `app:${prefix.slice('app/src/'.length)}`;

/** The map of one file: the last sourceMappingURL comment, inline base64 or fetched (never counted). */
async function findMap(script, text) {
  const all = [...text.matchAll(MAP_COMMENT)];
  if (all.length === 0) return null;
  const ref = all[all.length - 1][1];
  if (ref.startsWith(DATA_MAP)) {
    return JSON.parse(Buffer.from(ref.slice(DATA_MAP.length), 'base64').toString('utf8'));
  }
  const res = await fetch(new URL(ref, script.url));
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return JSON.parse(await res.text());
}

/** One finding `{ category, key }` for a normalized source, or null. */
function classify(n) {
  if (n.pkg !== undefined) {
    const spec = n.subpath ? `${n.pkg}/${n.subpath}` : n.pkg;
    const hit = findHeavy(spec, HEAVY_PACKAGES);
    if (!hit) return null;
    // A prefix inside a package (the exporters) keys by the prefix; anything else by the package name.
    const key = hit.name.length > n.pkg.length ? `pkg:${hit.name}` : `pkg:${n.pkg}`;
    return { category: hit.entry.category, key };
  }
  const lazy = appForm(LAZY_ROOT);
  if (n.key.startsWith(lazy)) {
    const name = n.key.slice(lazy.length).split('/')[0];
    return { category: 'lazy', key: `${lazy}${name}/` };
  }
  const editor = EDITOR_CODE.map(appForm).find((p) => n.key.startsWith(p));
  if (editor) return { category: 'editor', key: editor };
  return null;
}

/**
 * @param ctx { browser, profile, baseUrl }
 * @param entry an ENTRY_RULES key (`office`, `editor`, `field-pack`, `client-link`, `sign-in`)
 * @returns {Promise<{ value: number; details: object } | { error: string; details: object }>}
 */
export async function measureJsContents(ctx, url, entry) {
  const rules = ENTRY_RULES[entry];
  if (!rules) throw new Error(`no ENTRY_RULES for entry ${entry}`);
  const collected = await collectScripts(ctx, url);
  const details = { url, status: collected.details.status, files: [] };
  if (collected.error !== undefined) return { error: collected.error, details };

  const modules = {};
  const byGroup = {};
  const found = new Map();
  const missingMaps = [];
  let mappedBytes = 0;
  let unmappedBytes = 0;
  for (const script of collected.scripts) {
    if (script.serviceWorker) continue;
    details.files.push({ url: script.displayUrl, rawBytes: script.body.length });
    const text = script.body.toString('utf8');
    const map = await findMap(script, text);
    if (!map) {
      missingMaps.push(script.displayUrl);
      continue;
    }
    const { bytesBySource, unmapped, total } = attribute(text, map);
    unmappedBytes += unmapped;
    mappedBytes += total - unmapped;
    for (const [source, bytes] of Object.entries(bytesBySource)) {
      const n = normalizeSource(source);
      modules[n.key] = (modules[n.key] ?? 0) + bytes;
      const g = groupKey(n.key);
      byGroup[g] = (byGroup[g] ?? 0) + bytes;
      const f = classify(n);
      if (f && rules.includes(f.category)) {
        const id = `${f.category} ${f.key}`;
        const prev = found.get(id) ?? { ...f, bytes: 0 };
        prev.bytes += bytes;
        found.set(id, prev);
      }
    }
  }

  details.forbidden = [...found.values()];
  details.modules = modules;
  details.byGroup = byGroup;
  details.watch = Object.fromEntries(
    WATCH_PACKAGES.map((w) => {
      let bytes = null;
      for (const [key, b] of Object.entries(modules)) {
        if (key.startsWith('pkg:') && matchesName(key.slice(4), w)) bytes = (bytes ?? 0) + b;
      }
      return [w, bytes];
    }),
  );
  details.mappedBytes = mappedBytes;
  details.unmappedBytes = unmappedBytes;

  if (missingMaps.length > 0) {
    details.missingMaps = missingMaps;
    return { error: 'missing_source_map', details };
  }
  if (!Object.keys(modules).some((k) => k.startsWith('app:'))) {
    details.reason = 'no app sources';
    return { error: 'no_app_sources', details };
  }
  return { value: found.size, details };
}
