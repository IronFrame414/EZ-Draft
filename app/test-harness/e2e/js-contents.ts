// EZD-117a section 3 (vault/plans/EZD-117a.md, harness row; E4): the EZD-020 contents collector and the EZD-017
// size measurement for a signed-in page. The perf scripts open their own browser contexts, so each context is
// created with the signed-in storage state. Playwright loads this file as CommonJS, so the ESM perf scripts are loaded with a real dynamic import at call time.
import type { Browser, BrowserContext } from '@playwright/test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
type Measured = { value: number; details: object } | { error: string; details: object };

// A real import(): TypeScript's CommonJS output would turn a plain import() into require().
const esm = new Function('u', 'return import(u)') as (u: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const perf = (file: string) =>
  esm(pathToFileURL(path.resolve(__dirname, '../../../scripts/perf', file)).href);

// EZD-172: the build lane's web port, from `local.mjs lane` (the same source app/playwright.config.ts uses).
const laneRun = spawnSync(
  process.execPath,
  [path.resolve(__dirname, '../../../scripts/db/local.mjs'), 'lane'],
  { encoding: 'utf8' },
);
if (laneRun.status !== 0) throw new Error((laneRun.stderr ?? '').trim() || 'local.mjs lane failed');
const BASE_URL = `http://127.0.0.1:${(JSON.parse(laneRun.stdout.trim()) as { web: number }).web}`;

function wrap(browser: Browser, storageState: StorageState) {
  return {
    newContext: (o?: Parameters<Browser['newContext']>[0]) =>
      browser.newContext({ ...o, storageState }),
  };
}

export async function signedInJsContents(
  browser: Browser,
  storageState: StorageState,
  url: string,
): Promise<Measured> {
  const { measureJsContents } = await perf('js-contents.mjs');
  const { PROFILES } = await perf('perf.config.mjs');
  return (await measureJsContents(
    { browser: wrap(browser, storageState), profile: PROFILES.desktop, baseUrl: BASE_URL },
    url,
    'office',
  )) as Measured;
}

export async function signedInJsSize(
  browser: Browser,
  storageState: StorageState,
  url: string,
): Promise<Measured> {
  const { measureJsSize } = await perf('js-size.mjs');
  const { PROFILES } = await perf('perf.config.mjs');
  return (await measureJsSize(
    wrap(browser, storageState),
    PROFILES.desktop,
    BASE_URL,
    url,
  )) as Measured;
}
