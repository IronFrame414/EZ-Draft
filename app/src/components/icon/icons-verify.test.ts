// EZD-171 T4-T7 (vault/plans/EZD-171.md section 4). Fake fetch only; no network.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  formatReport,
  iconSourceUrl,
  readIconCommit,
  verifyIcons,
} from '../../../scripts/icons-verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(here, 'svg');
const legacyDir = path.join(here, '__fixtures__/legacy');
const fetchScript = path.resolve(here, '../../../scripts/icons-fetch.mjs');
const COMMIT = '49d4db35df873165d6bd6ba09b063c7dafbac2f4';
const BASE = 'https://raw.githubusercontent.com/google/material-design-icons';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'ezd171-'));
const ok = (b: Buffer | string) => new Response(Buffer.from(b), { status: 200 });

function fakeFrom(map: Map<string, Buffer | string>, urls: string[] = []) {
  return async (url: unknown) => {
    const u = String(url);
    urls.push(u);
    const body = map.get(u);
    return body === undefined ? new Response('', { status: 404 }) : ok(body);
  };
}

const folderFiles = () =>
  readdirSync(svgDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== 'CONVERTED.md')
    .map((d) => d.name)
    .sort();

async function runReal(breakAuto: boolean) {
  const commit = readIconCommit(fetchScript);
  const map = new Map<string, Buffer | string>();
  const files = folderFiles();
  for (const f of files) {
    const u = iconSourceUrl(commit, f);
    map.set(u as string, readFileSync(path.join(svgDir, f)));
  }
  const autoUrl = `${BASE}/${commit}/symbols/web/auto_awesome/materialsymbolsoutlined/auto_awesome_20px.svg`;
  map.set(
    autoUrl,
    breakAuto
      ? readFileSync(path.join(svgDir, 'auto_awesome.svg'))
      : readFileSync(path.join(legacyDir, 'auto_awesome_20px.svg')),
  );
  const urls: string[] = [];
  const result = await verifyIcons({
    svgDir,
    legacyDir,
    commit,
    fetchImpl: fakeFrom(map, urls),
  });
  return { commit, files, urls, result };
}

describe('EZD-171 icons verify', () => {
  it('EZD-171 T4 (a) the real folder verifies through the kept original', async () => {
    const { commit, files, urls, result } = await runReal(false);
    expect(commit).toBe(COMMIT);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(files.length);
    expect(result.converted).toEqual(['auto_awesome.svg']);
    expect(result.problems).toEqual([]);
    expect(urls).toEqual(files.map((f) => iconSourceUrl(commit, f)));
    expect(urls.every((u) => u && !u.endsWith('CONVERTED.md'))).toBe(true);
  });

  it('EZD-171 T4 (b) a converted icon is checked, not skipped', async () => {
    const { result } = await runReal(true);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ file: 'auto_awesome.svg', code: 'mismatch' }]);
  });

  async function t5() {
    const dir = tmp();
    for (const f of ['a.svg', 'b-fill.svg', 'LICENSE', 'Bad.svg', 'CONVERTED.md']) {
      writeFileSync(path.join(dir, f), `bytes of ${f}`);
    }
    const c = 'c'.repeat(40);
    const base = `${BASE}/${c}`;
    const map = new Map<string, string>([
      [`${base}/LICENSE`, 'bytes of LICENSE'],
      [`${base}/symbols/web/a/materialsymbolsoutlined/a_20px.svg`, 'bytes of a.svg'],
      [`${base}/symbols/web/b/materialsymbolsoutlined/b_fill1_20px.svg`, 'bytes of b-fill.svg'],
    ]);
    const urls: string[] = [];
    const result = await verifyIcons({
      svgDir: dir,
      legacyDir: path.join(tmp(), 'missing'),
      commit: c,
      fetchImpl: fakeFrom(map, urls),
    });
    return { base, urls, result, c };
  }

  it('EZD-171 T5 file names map to upstream URLs; bad names and the notice are not fetched', async () => {
    const { base, urls, result } = await t5();
    expect(urls).toEqual([
      `${base}/LICENSE`,
      `${base}/symbols/web/a/materialsymbolsoutlined/a_20px.svg`,
      `${base}/symbols/web/b/materialsymbolsoutlined/b_fill1_20px.svg`,
    ]);
    expect(result.problems).toEqual([{ file: 'Bad.svg', code: 'invalid_name' }]);
    expect(result.checked).toBe(4);
    expect(result.converted).toEqual([]);
  });

  function dirAB() {
    const dir = tmp();
    writeFileSync(path.join(dir, 'a.svg'), 'AAAA');
    writeFileSync(path.join(dir, 'b.svg'), 'BBBB');
    return dir;
  }
  const missing = () => path.join(tmp(), 'missing');
  const c40 = 'd'.repeat(40);
  const urlOf = (n: string) =>
    `${BASE}/${c40}/symbols/web/${n}/materialsymbolsoutlined/${n}_20px.svg`;

  async function t6a() {
    const fetchImpl = async (url: unknown) =>
      String(url) === urlOf('a') ? ok('AAAB') : new Response('', { status: 404 });
    return verifyIcons({ svgDir: dirAB(), legacyDir: missing(), commit: c40, fetchImpl });
  }

  it('EZD-171 T6 (a) a different byte is a mismatch and a 404 is fetch_failed with status', async () => {
    const result = await t6a();
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      { file: 'a.svg', code: 'mismatch' },
      { file: 'b.svg', code: 'fetch_failed', status: 404 },
    ]);
  });

  it('EZD-171 T6 (b) a thrown fetch is fetch_failed without status', async () => {
    const result = await verifyIcons({
      svgDir: dirAB(),
      legacyDir: missing(),
      commit: c40,
      fetchImpl: async () => {
        throw new Error('network');
      },
    });
    expect(result.problems).toEqual([
      { file: 'a.svg', code: 'fetch_failed' },
      { file: 'b.svg', code: 'fetch_failed' },
    ]);
    expect('status' in result.problems[0]).toBe(false);
    expect('status' in result.problems[1]).toBe(false);
  });

  it('EZD-171 T6 (c) a converted icon is compared with its kept original', async () => {
    const dir = tmp();
    const legacy = tmp();
    writeFileSync(path.join(dir, 'c.svg'), 'X');
    writeFileSync(path.join(legacy, 'c_20px.svg'), 'Y');
    const run = (body: string) =>
      verifyIcons({
        svgDir: dir,
        legacyDir: legacy,
        commit: c40,
        fetchImpl: async () => ok(body),
      });
    const good = await run('Y');
    expect(good.ok).toBe(true);
    expect(good.checked).toBe(1);
    expect(good.converted).toEqual(['c.svg']);
    expect(good.problems).toEqual([]);
    const bad = await run('X');
    expect(bad.problems).toEqual([{ file: 'c.svg', code: 'mismatch' }]);
  });

  it('EZD-171 T7 formatReport, readIconCommit and the package script', async () => {
    const a = await runReal(false);
    expect(formatReport(a.result, COMMIT)).toEqual([
      `ICONS VERIFY OK ${a.result.checked} files at ${COMMIT}`,
    ]);
    const b = await runReal(true);
    expect(formatReport(b.result, COMMIT)).toEqual([
      'mismatch auto_awesome.svg',
      `ICONS VERIFY FAIL 1 of ${b.result.checked} files at ${COMMIT}`,
    ]);
    expect(formatReport(await t6a(), c40)).toEqual([
      'mismatch a.svg',
      'fetch_failed b.svg HTTP 404',
      `ICONS VERIFY FAIL 2 of 2 files at ${c40}`,
    ]);
    const five = await t5();
    expect(formatReport(five.result, five.c)).toEqual([
      'invalid_name Bad.svg',
      `ICONS VERIFY FAIL 1 of 4 files at ${five.c}`,
    ]);
    const noLine = path.join(tmp(), 'f.mjs');
    writeFileSync(noLine, 'export const OTHER = 1;\n');
    expect(() => readIconCommit(noLine)).toThrow('icon_commit_not_found');
    const pkg = JSON.parse(readFileSync(path.resolve(here, '../../../package.json'), 'utf8'));
    expect(pkg.scripts['icons:verify']).toBe('node scripts/icons-verify.mjs');
  });
});
