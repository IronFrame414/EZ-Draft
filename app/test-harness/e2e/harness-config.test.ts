// EZD-016d T5, T6, T14 (vault/plans/EZD-016d.md section 4). The config and setup are imported dynamically and
// process.env is snapshotted and restored in finally, because the Playwright config overwrites the Vitest gate
// secret with the one `pnpm db:up` stored (PS V3).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

type AnyRecord = Record<string, unknown>;

function snapshotEnv(): () => void {
  const saved = { ...process.env };
  return () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) process.env[k] = v;
  };
}

const norm = (p: string) => p.replace(/\\/g, '/');

describe('EZD-016d harness config', () => {
  // T5 (AC-EZD-016d-1): Step 1; 04 line 7; S17/S18; Q-0053; Q-0088; Q-0114; 7f; EZD-008a; Step 2.3; Q-0087; PS V4.
  test('EZD-016d done when: the browser runner has desktop, iPad landscape, Surface and phone projects at their sizes @smoke', async () => {
    const restore = snapshotEnv();
    try {
      const grepAtImport = process.env.EZD_TEST_GREP;
      const devicesMod = await import('./devices');
      const config = (await import('../../playwright.config')).default as unknown as AnyRecord;
      const secretAfterImport = process.env.SUPABASE_API_GATE_SECRET;

      // (a) projects
      const projects = config.projects as AnyRecord[];
      expect(projects.map((p) => p.name)).toEqual([
        'desktop',
        'ipad-landscape',
        'surface',
        'phone',
      ]);
      const useOf = (name: string) => projects.find((p) => p.name === name)!.use as AnyRecord;

      const desktop = useOf('desktop');
      expect(desktop.defaultBrowserType).toBe('chromium');
      expect(desktop.viewport).toEqual({ width: 1600, height: 1000 });
      expect(desktop.deviceScaleFactor).toBe(1);
      expect(desktop.hasTouch).toBe(false);
      expect(desktop.isMobile).toBe(false);

      const ipad = useOf('ipad-landscape');
      expect(ipad.defaultBrowserType).toBe('webkit');
      expect(ipad.viewport).toEqual({ width: 1180, height: 820 });
      expect(ipad.deviceScaleFactor).toBe(2);
      expect(ipad.hasTouch).toBe(true);
      expect(ipad.isMobile).toBe(true);

      const surface = useOf('surface');
      expect(surface.defaultBrowserType).toBe('chromium');
      expect(surface.viewport).toEqual({ width: 1440, height: 960 });
      expect(surface.deviceScaleFactor).toBe(2);
      expect(surface.hasTouch).toBe(true);
      expect(surface.isMobile).toBe(false);
      expect(surface.channel).toBeUndefined();

      const phone = useOf('phone');
      expect(phone.defaultBrowserType).toBe('webkit');
      expect(phone.viewport).toEqual({ width: 390, height: 844 });
      expect(phone.hasTouch).toBe(true);
      expect(phone.isMobile).toBe(true);

      // (b) per-project grep repeats the gate scope
      for (const p of projects) {
        expect(p.grep).toBeInstanceOf(RegExp);
        expect((p.grep as RegExp).source).toBe(
          devicesMod.projectGrep(p.name as 'desktop', grepAtImport).source,
        );
      }

      // (c) runner
      expect(config.workers).toBe(4);
      expect(config.retries).toBe(0);
      expect(config.timeout).toBe(60000);
      const topUse = (config.use ?? {}) as AnyRecord;
      expect(topUse.baseURL).toBe('http://127.0.0.1:3000');
      const webServer = config.webServer as AnyRecord;
      expect(webServer.url).toBe('http://127.0.0.1:3000/api/health');
      for (const key of ['testDir', 'outputDir', 'globalSetup']) {
        expect(typeof config[key]).toBe('string');
        expect(path.isAbsolute(config[key] as string)).toBe(true);
      }
      expect(typeof webServer.cwd).toBe('string');
      expect(path.isAbsolute(webServer.cwd as string)).toBe(true);
      expect(norm(config.globalSetup as string).endsWith('test-harness/e2e/global-setup.ts')).toBe(
        true,
      );

      // (d) server env
      const env = webServer.env as Record<string, string>;
      expect(env.EMAIL_TRANSPORT).toBe('stub');
      expect(env.EMAIL_FROM).toBe('EZ Draft Test <test@example.test>');
      expect(norm(env.EMAIL_STUB_DIR).endsWith('app/.e2e/email-outbox')).toBe(true);
      expect(typeof env.SUPABASE_API_GATE_SECRET).toBe('string');
      expect(env.SUPABASE_API_GATE_SECRET.length).toBeGreaterThan(0);
      expect(env.SUPABASE_API_GATE_SECRET).toBe(secretAfterImport);
      expect(env.SUPABASE_SECRET_KEY).toBe('');
      expect(env.EZD_TEST_DB_URL).toBe('');
      for (const [k, v] of Object.entries(env)) {
        if (k.startsWith('NEXT_PUBLIC_')) expect(v).not.toBe(env.SUPABASE_API_GATE_SECRET);
      }

      // (e) no browser headers
      expect(topUse.extraHTTPHeaders).toBeUndefined();
      for (const p of projects) {
        expect(((p.use ?? {}) as AnyRecord).extraHTTPHeaders).toBeUndefined();
      }
    } finally {
      restore();
    }
  }, 60000);

  // T6 (AC-EZD-016d-1): Step 1; Q-0006; scripts/gate.mjs line 45; Q-0088.
  test('EZD-016d T6 routing regexes send each test to its tagged devices inside the gate scope @smoke', async () => {
    const { projectGrep } = await import('./devices');
    const ALL = ['desktop', 'ipad-landscape', 'surface', 'phone'] as const;
    const A: string | undefined = undefined;
    const B = '(?:EZD-0\\d{2}[a-z]?(?![0-9]))|@smoke';
    const C = '(?:EZD-1\\d{2}[a-z]?(?![0-9]))|@smoke';
    const D = '';

    const runsIn = (text: string, scope: string | undefined): string[] =>
      ALL.filter((p) => projectGrep(p, scope).test(`${p} e2e/x.spec.ts ${text}`));

    const cases: Array<{ text: string; scopes: Array<string | undefined>; expected: string[] }> = [
      // untagged and single-tag cases
      { text: 'EZD-007 x', scopes: [A, B, D], expected: ['desktop'] },
      { text: 'EZD-007 x', scopes: [C], expected: [] },
      { text: 'EZD-026b x @phone', scopes: [A, B, D], expected: ['phone'] },
      { text: 'EZD-026b x @phone', scopes: [C], expected: [] },
      { text: 'EZD-014 x @surface', scopes: [A, B, D], expected: ['surface'] },
      { text: 'EZD-014 x @surface', scopes: [C], expected: [] },
      { text: 'EZD-101 x @ipad', scopes: [C], expected: ['ipad-landscape'] },
      { text: 'EZD-101 x @ipad', scopes: [B], expected: [] },
      // multi-tag cases
      {
        text: 'EZD-016a x @smoke @desktop @ipad @surface @phone',
        scopes: [A, B, C, D],
        expected: ['desktop', 'ipad-landscape', 'surface', 'phone'],
      },
      {
        text: 'EZD-016a x @desktop @ipad',
        scopes: [A, B, D],
        expected: ['desktop', 'ipad-landscape'],
      },
      {
        text: 'EZD-032 x @desktop @ipad @surface @smoke',
        scopes: [A, B, C, D],
        expected: ['desktop', 'ipad-landscape', 'surface'],
      },
    ];

    for (const c of cases) {
      for (const scope of c.scopes) {
        expect(runsIn(c.text, scope), `${c.text} with scope ${JSON.stringify(scope)}`).toEqual(
          c.expected,
        );
      }
    }

    // (d) an empty scope gives the same results as unset, for every case text
    for (const text of [...new Set(cases.map((c) => c.text))]) {
      expect(runsIn(text, D), text).toEqual(runsIn(text, A));
    }
  });

  // T14 (AC-EZD-016d-1, added L-012): Step 3; PS Step 6; 16c SEED_PROJECT_COUNT 200; EZD-008a clearStubOutboxDir.
  test('EZD-016d T14 global setup refuses a missing secret, outbox or seed and empties the outbox', async () => {
    const { default: globalSetup, seedMissing } = await import('./global-setup');

    // (b) seedMissing
    const full = { tenant1: true, josh: true, tenant2: true, tenant1Projects: 200 };
    expect(seedMissing(full)).toBe(false);
    expect(seedMissing({ ...full, tenant1: false })).toBe(true);
    expect(seedMissing({ ...full, josh: false })).toBe(true);
    expect(seedMissing({ ...full, tenant2: false })).toBe(true);
    expect(seedMissing({ ...full, tenant1Projects: 199 })).toBe(true);
    expect(seedMissing({ ...full, tenant1Projects: 201 })).toBe(true);

    const restore = snapshotEnv();
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd016d-'));
    try {
      // (a) empty gate secret
      process.env.SUPABASE_API_GATE_SECRET = '';
      process.env.EMAIL_STUB_DIR = path.join(tmp, 'unused');
      await expect(globalSetup()).rejects.toThrow('Gate secret missing: run pnpm db:up');

      // (a2) secret set, outbox name deleted
      process.env.SUPABASE_API_GATE_SECRET = 'x';
      delete process.env.EMAIL_STUB_DIR;
      await expect(globalSetup()).rejects.toThrow('EMAIL_STUB_DIR missing');

      // (c) existing outbox: .json removed, other files kept
      const outbox = path.join(tmp, 'outbox');
      mkdirSync(outbox);
      writeFileSync(path.join(outbox, 'old.json'), '{}');
      writeFileSync(path.join(outbox, 'keep.txt'), 'keep');
      process.env.EMAIL_STUB_DIR = outbox;
      await expect(globalSetup()).resolves.toBeUndefined();
      expect(existsSync(path.join(outbox, 'old.json'))).toBe(false);
      expect(existsSync(path.join(outbox, 'keep.txt'))).toBe(true);

      // (c2) outbox that does not exist yet
      const fresh = path.join(tmp, 'not-yet', 'outbox');
      process.env.EMAIL_STUB_DIR = fresh;
      await expect(globalSetup()).resolves.toBeUndefined();
      expect(existsSync(fresh)).toBe(true);
    } finally {
      restore();
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);
});
