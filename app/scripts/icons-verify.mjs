// EZD-171 (vault/plans/EZD-171.md D4-D6): checks the committed icon files against the pinned commit.
// Run by hand: pnpm --filter @ezdraft/app icons:verify (network; never in tests or the gate).
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{ ok: boolean, checked: number, converted: string[],
 *   problems: { file: string, code: 'mismatch' | 'fetch_failed' | 'invalid_name', status?: number }[] }} IconsVerifyResult
 */

const NAME = /^[a-z0-9_]+(-fill)?$/;
const baseUrl = (commit) =>
  `https://raw.githubusercontent.com/google/material-design-icons/${commit}`;

export function readIconCommit(fetchScriptPath) {
  const m = /^export const ICON_COMMIT = '([0-9a-f]{40})';$/m.exec(
    readFileSync(fetchScriptPath, 'utf8'),
  );
  if (!m) throw new Error('icon_commit_not_found');
  return m[1];
}

/** The upstream file name of an .svg file name, or null. */
function upstreamName(file) {
  if (!file.endsWith('.svg')) return null;
  const name = file.slice(0, -4);
  if (!NAME.test(name)) return null;
  const isFill = name.endsWith('-fill');
  const b = isFill ? name.slice(0, -5) : name;
  return isFill ? `${b}_fill1_20px.svg` : `${b}_20px.svg`;
}

export function iconSourceUrl(commit, file) {
  const base = baseUrl(commit);
  if (file === 'LICENSE') return `${base}/LICENSE`;
  const u = upstreamName(file);
  if (u === null) return null;
  const b = file.slice(0, -4).replace(/-fill$/, '');
  return `${base}/symbols/web/${b}/materialsymbolsoutlined/${u}`;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** @returns {Promise<IconsVerifyResult>} */
export async function verifyIcons({ svgDir, legacyDir, commit, fetchImpl }) {
  const files = readdirSync(svgDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== 'CONVERTED.md')
    .map((e) => e.name)
    .sort();
  const converted = [];
  const problems = [];
  for (const file of files) {
    const url = iconSourceUrl(commit, file);
    if (url === null) {
      problems.push({ file, code: 'invalid_name' });
      continue;
    }
    let expectedPath = path.join(svgDir, file);
    if (file !== 'LICENSE') {
      const kept = path.join(legacyDir, upstreamName(file));
      if (isFile(kept)) {
        expectedPath = kept;
        converted.push(file);
      }
    }
    let res;
    try {
      res = await fetchImpl(url);
    } catch {
      problems.push({ file, code: 'fetch_failed' });
      continue;
    }
    if (res.status !== 200) {
      problems.push({ file, code: 'fetch_failed', status: res.status });
      continue;
    }
    const got = Buffer.from(await res.arrayBuffer());
    if (!got.equals(readFileSync(expectedPath))) problems.push({ file, code: 'mismatch' });
  }
  return { ok: problems.length === 0, checked: files.length, converted, problems };
}

export function formatReport(result, commit) {
  if (result.ok) return [`ICONS VERIFY OK ${result.checked} files at ${commit}`];
  return [
    ...result.problems.map(
      (p) => `${p.code} ${p.file}${p.status !== undefined ? ` HTTP ${p.status}` : ''}`,
    ),
    `ICONS VERIFY FAIL ${result.problems.length} of ${result.checked} files at ${commit}`,
  ];
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const commit = readIconCommit(path.join(here, 'icons-fetch.mjs'));
  const result = await verifyIcons({
    svgDir: path.resolve(here, '../src/components/icon/svg'),
    legacyDir: path.resolve(here, '../src/components/icon/__fixtures__/legacy'),
    commit,
    fetchImpl: fetch,
  });
  process.stdout.write(formatReport(result, commit).join('\n') + '\n');
  process.exit(result.ok ? 0 : 1);
}
