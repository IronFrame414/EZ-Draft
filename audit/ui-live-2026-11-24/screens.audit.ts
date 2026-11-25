// EZD-1960 (audit 2026-11-23 Area 7 U4, U12): live signed-in screenshots of every screen U12 names, on desktop
// 1600 x 1000, iPad landscape 1180 x 820 with a true touch profile (isMobile + hasTouch, so any-pointer: coarse
// applies) and phone 390 x 844. Signs in as the seeded owner (josh@example.com) on the base stack (lane 0, 54321).
// Touch targets come from the repo's own helper (app/test-harness/touch-targets.ts expectTouchTargets); its
// failure list is caught and written to notes.json, never asserted. Report only: nothing here gates a build.
// Input: AUDIT_ENV, a JSON file with the four `node scripts/db/local.mjs env` values (lane 0).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { devices, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { expectTouchTargets } from '../../app/test-harness/touch-targets';

const OUT = path.join(__dirname, 'screens');
const env = JSON.parse(
  readFileSync(process.env.AUDIT_ENV ?? '/tmp/ezd1960-env.json', 'utf8'),
) as Record<string, string>;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-ezd-api-gate': env.SUPABASE_API_GATE_SECRET } },
});
const OWNER = 'josh@example.com';
const P1 = '00000000-0000-4000-8000-000000100001';
const SETTINGS = [
  'company',
  'users',
  'title-block',
  'sheet-presets',
  'defaults',
  'catalog',
  'render-models',
  'code-edition',
  'libraries',
  'system-status',
];

const DESKTOP = { viewport: { width: 1600, height: 1000 } };
// The same descriptor as the repo's ipad-landscape project (app/test-harness/e2e/devices.ts).
const IPAD = {
  ...devices['iPad Pro 11 landscape'],
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
};
const PHONE = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } };

type Note = {
  url: string;
  status?: number | null;
  anyPointerCoarse?: boolean;
  consoleErrors: string[];
  steps: string[];
  touchChecked?: number;
  touchFailures?: string[];
  h?: string[];
};
const notes: Record<string, Note> = {};
let clientLink: string | null = null;

async function signIn(page: Page): Promise<void> {
  const created = await admin.auth.admin.createUser({ email: OWNER, email_confirm: true });
  if (created.error && created.error.code !== 'email_exists')
    throw new Error('createUser ' + created.error.code);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER });
  if (error) throw new Error('generateLink ' + error.message);
  await page.goto(
    `/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=email`,
  );
  await page.getByTestId('confirm-submit').click();
  await page.waitForURL((u) => u.pathname === '/', { timeout: 90_000 });
}

async function shot(
  page: Page,
  name: string,
  opts: {
    goto?: string;
    act?: (p: Page) => Promise<unknown>;
    settle?: number;
    touch?: boolean;
  } = {},
): Promise<void> {
  const note: Note = { url: '', consoleErrors: [], steps: [] };
  const t0 = Date.now();
  console.log('start', name);
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === 'error') note.consoleErrors.push(m.text().slice(0, 240));
  };
  page.on('console', onConsole);
  try {
    if (opts.goto) {
      const r = await page.goto(opts.goto, { waitUntil: 'load', timeout: 120_000 });
      note.status = r?.status() ?? null;
    }
    if (opts.act) await opts.act(page);
  } catch (e) {
    note.steps.push('step failed: ' + String(e).split('\n')[0].slice(0, 300));
  }
  await page.waitForTimeout(opts.settle ?? 1500);
  note.url = new URL(page.url()).pathname + new URL(page.url()).search;
  note.anyPointerCoarse = await page
    .evaluate(() => matchMedia('(any-pointer: coarse)').matches)
    .catch(() => undefined);
  note.h = await page
    .evaluate(() =>
      [...document.querySelectorAll('h1,h2,[role=dialog] h2')]
        .map((h) => (h.textContent ?? '').trim())
        .slice(0, 6),
    )
    .catch(() => []);
  if (opts.touch) {
    try {
      note.touchChecked = await expectTouchTargets(page, page.locator('body'));
      note.touchFailures = [];
    } catch (e) {
      const actual = (e as { matcherResult?: { actual?: unknown } }).matcherResult?.actual;
      note.touchFailures = Array.isArray(actual)
        ? (actual as string[])
        : ['helper error: ' + String(e).slice(0, 200)];
    }
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  page.off('console', onConsole);
  notes[name] = note;
  console.log('done', name, Date.now() - t0, 'ms', note.steps.join(' | ').slice(0, 200));
}

const tid = (p: Page, id: string) => p.getByTestId(id);
const rail = (p: Page, tool: string) => p.locator(`[data-rail-tool="${tool}"]`);

async function openEditor(p: Page) {
  await p.goto(`/projects/${P1}`);
  await tid(p, 'editor-state').waitFor({ timeout: 120_000 });
  await p.locator('[data-editor-state="ready"]').waitFor({ timeout: 120_000 });
}

// Draws one 12' x 10' room with the Room rectangle tool and typed sizes (editor-drawing-lazy.spec.ts steps), so the
// tool screens have walls to show. Only on the first desktop pass; the base stack keeps it.
async function drawRoom(p: Page) {
  const walls = await p.evaluate(
    () =>
      (window as unknown as { __ezdraftEditor?: { objects(): { type: string }[] } }).__ezdraftEditor
        ?.objects()
        .filter((o) => o.type === 'wall').length ?? -1,
  );
  if (walls > 0) return;
  await rail(p, 'room-rect').click();
  const box = await tid(p, 'plan-canvas').boundingBox();
  if (!box) throw new Error('no plan canvas');
  await p.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.3);
  await p.keyboard.type(`12'`);
  await p.keyboard.press('Tab');
  await p.keyboard.type(`10'`);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1000);
  await rail(p, 'select').click();
}

// The seeded projects have no customer, and Send needs a client with an email (send dialog). The audit gives P1 a
// made-up customer once (base stack only; `db:base` resets it).
async function giveP1AClient(): Promise<void> {
  const { data: proj } = await admin
    .from('project')
    .select('tenant_id, customer_id')
    .eq('id', P1)
    .single();
  if (!proj || proj.customer_id) return;
  const { data: c, error } = await admin
    .from('customer')
    .insert({ tenant_id: proj.tenant_id, name: 'Audit client', email: 'audit-client@example.test' })
    .select('id')
    .single();
  if (error || !c) throw new Error('customer insert ' + (error?.code ?? ''));
  await admin.from('project').update({ customer_id: c.id }).eq('id', P1);
}

async function newContext(
  browser: Browser,
  use: object,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...use, baseURL: test.info().project.use.baseURL });
  return { ctx, page: await ctx.newPage() };
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
// Written after every test and merged with the file, so a failed test (new worker) keeps the earlier notes.
test.afterEach(() => {
  const file = path.join(OUT, 'notes.json');
  let old: { notes?: Record<string, Note> } = {};
  try {
    old = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    old = {};
  }
  writeFileSync(file, JSON.stringify({ notes: { ...old.notes, ...notes } }, null, 2) + '\n');
});

test('desktop 1600 x 1000', async ({ browser }) => {
  const { ctx, page: p } = await newContext(browser, DESKTOP);
  await signIn(p);
  await shot(p, 'desktop-S01-projects', { goto: '/', settle: 3000 });
  await shot(p, 'desktop-S01b-new-project', {
    act: async () => {
      await tid(p, 'projects-new').click();
      await tid(p, 'projects-new-standalone').click();
      await tid(p, 'new-project-dialog').waitFor({ timeout: 20_000 });
    },
  });
  await p.keyboard.press('Escape');
  await shot(p, 'desktop-S01c-notifications', { act: () => tid(p, 'notification-bell').click() });
  await p.keyboard.press('Escape');
  await shot(p, 'desktop-S01d-avatar-menu', { act: () => tid(p, 'avatar-menu-trigger').click() });
  await shot(p, 'desktop-S01e-my-profile', { act: () => tid(p, 'avatar-menu-profile').click() });
  await p.keyboard.press('Escape');
  for (const s of SETTINGS)
    await shot(p, `desktop-S15-settings-${s}`, { goto: `/settings/${s}`, settle: 2500 });

  await shot(p, 'desktop-S03-plan-empty', { act: () => openEditor(p), settle: 2500 });
  await shot(p, 'desktop-S03-plan-room', { act: () => drawRoom(p), settle: 2000 });
  await shot(p, 'desktop-S03d-wall-selected', {
    act: async () => {
      // The room's left wall is drawn at x 400-423 px, y 207-845 px of the 1600 x 1000 window
      // (screens/desktop-S03-plan-room.png); click its middle.
      await p.mouse.click(411, 500);
    },
  });
  await p.keyboard.press('Escape');
  for (const t of [
    'wall',
    'door',
    'window',
    'cabinets',
    'countertops',
    'electrical',
    'fixtures',
    'sketch',
    'measure',
    'ceiling',
  ]) {
    await shot(p, `desktop-S03-tool-${t}`, { act: () => rail(p, t).click(), settle: 1500 });
    await p.keyboard.press('Escape');
    await rail(p, 'select')
      .click()
      .catch(() => {});
  }
  await shot(p, 'desktop-S03c-assistant', {
    act: () => rail(p, 'assistant').click(),
    settle: 2000,
  });
  await p.keyboard.press('Escape');
  await shot(p, 'desktop-S03-help', { act: () => rail(p, 'help').click() });
  await p.keyboard.press('Escape');
  await shot(p, 'desktop-S05-ceiling-surface', { act: () => tid(p, 'surface-ceiling').click() });
  await tid(p, 'surface-floor')
    .click()
    .catch(() => {});
  await shot(p, 'desktop-S20-versions', { act: () => tid(p, 'left-panel-tab-versions').click() });
  await tid(p, 'left-panel-tab-layers')
    .click()
    .catch(() => {});
  await shot(p, 'desktop-S02-upload-files', { act: () => tid(p, 'editor-upload-files').click() });
  await p.keyboard.press('Escape');
  await shot(p, 'desktop-S07-3d', {
    act: () =>
      p
        .getByRole('link', { name: '3D', exact: true })
        .or(p.getByRole('button', { name: '3D', exact: true }))
        .first()
        .click(),
    settle: 5000,
  });
  await shot(p, 'desktop-S13-sheets', {
    act: () =>
      p
        .getByRole('link', { name: 'Sheets', exact: true })
        .or(p.getByRole('button', { name: 'Sheets', exact: true }))
        .first()
        .click(),
    settle: 4000,
  });
  await p
    .getByRole('link', { name: 'Plan', exact: true })
    .or(p.getByRole('button', { name: 'Plan', exact: true }))
    .first()
    .click()
    .catch(() => {});
  await shot(p, 'desktop-S12-supplier', { goto: `/projects/${P1}/supplier`, settle: 3000 });
  await shot(p, 'desktop-S18-share-dialog', {
    act: async () => {
      await giveP1AClient();
      await openEditor(p);
      await tid(p, 'header-share').click();
      await tid(p, 'send-dialog').waitFor({ timeout: 20_000 });
    },
  });
  await shot(p, 'desktop-S18-share-sent', {
    act: async () => {
      await tid(p, 'send-submit').click();
      await p.locator('[data-send-state="sent"]').waitFor({ timeout: 30_000 });
      clientLink = await tid(p, 'send-copy-link').getAttribute('data-link');
    },
  });
  // S09: the catalog picker opens from a countertop's material row, which needs cabinets and tops the seed lacks;
  // the picker component is shot on its dev harness page instead (app/e2e/catalog-picker.spec.ts uses the same page).
  await shot(p, 'desktop-S09-catalog-picker-dev', { goto: '/dev/catalog', settle: 2500 });
  await shot(p, 'desktop-not-found', { goto: '/no-such-page' });
  await ctx.close();
});

test('iPad landscape 1180 x 820, touch profile', async ({ browser }) => {
  const { ctx, page: p } = await newContext(browser, IPAD);
  await signIn(p);
  await shot(p, 'ipad-S01-projects', { goto: '/', settle: 3000, touch: true });
  await shot(p, 'ipad-S01b-new-project', {
    act: async () => {
      await tid(p, 'projects-new').tap();
      await tid(p, 'projects-new-standalone').tap();
      await tid(p, 'new-project-dialog').waitFor({ timeout: 20_000 });
    },
    touch: true,
  });
  await p.keyboard.press('Escape');
  for (const s of SETTINGS)
    await shot(p, `ipad-S15-settings-${s}`, { goto: `/settings/${s}`, settle: 2500, touch: true });
  await shot(p, 'ipad-S03-plan', { act: () => openEditor(p), settle: 2500, touch: true });
  // S03d tablet: the typed bar shows Next field / Cancel under any-pointer: coarse (TypedEntryLayer).
  await shot(p, 'ipad-S03d-typed-bar', {
    act: async () => {
      await rail(p, 'room-rect').tap();
      await tid(p, 'typed-bar').waitFor({ timeout: 10_000 });
    },
    touch: true,
  });
  await tid(p, 'typed-bar-cancel')
    .tap()
    .catch(() => {});
  for (const t of ['cabinets', 'electrical']) {
    await shot(p, `ipad-S03-tool-${t}`, { act: () => rail(p, t).tap(), touch: true });
    await p.keyboard.press('Escape');
  }
  // At 1180 px the rail folds Ceiling into its "more" menu; the Floor / Ceiling switch shows the RCP.
  await shot(p, 'ipad-S05-ceiling-surface', {
    act: () => tid(p, 'surface-ceiling').tap(),
    touch: true,
  });
  await tid(p, 'surface-floor')
    .tap()
    .catch(() => {});
  await shot(p, 'ipad-S20-versions', {
    act: () => tid(p, 'left-panel-tab-versions').tap(),
    touch: true,
  });
  await shot(p, 'ipad-S13-sheets', {
    act: () =>
      p
        .getByRole('link', { name: 'Sheets', exact: true })
        .or(p.getByRole('button', { name: 'Sheets', exact: true }))
        .first()
        .tap(),
    settle: 4000,
    touch: true,
  });
  await ctx.close();
});

test('phone 390 x 844', async ({ browser }) => {
  const { ctx, page: p } = await newContext(browser, PHONE);
  await signIn(p);
  await shot(p, 'phone-S01-projects', { goto: '/', settle: 3000, touch: true });
  await shot(p, 'phone-S17-field-pack', {
    goto: `/projects/${P1}/field`,
    settle: 4000,
    touch: true,
  });
  await shot(p, 'phone-S17b-field-measure', {
    goto: `/projects/${P1}/field-measure`,
    settle: 4000,
    touch: true,
  });
  await ctx.close();
  // S18: the client link opens signed out, on the phone (S18 is a phone board).
  const anon = await newContext(browser, PHONE);
  if (clientLink) {
    await shot(anon.page, 'phone-S18-client-link', {
      goto: new URL(clientLink).pathname,
      settle: 4000,
      touch: true,
    });
  } else {
    notes['phone-S18-client-link'] = {
      url: '',
      consoleErrors: [],
      steps: ['no client link: the desktop Share step did not finish'],
    };
  }
  await anon.ctx.close();
});

// U4: signed out, open a deep link, sign in through the sign-in page (password), and see where the person lands.
test('U4 deep link then sign in', async ({ browser }) => {
  const { ctx, page: p } = await newContext(browser, DESKTOP);
  const password = 'Audit-' + Math.random().toString(36).slice(2) + '-1960';
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = list.users.find((u) => u.email === OWNER);
  if (user) await admin.auth.admin.updateUserById(user.id, { password });
  else await admin.auth.admin.createUser({ email: OWNER, password, email_confirm: true });
  const asked = '/settings/users';
  await shot(p, 'desktop-U4-deep-link-signed-out', { goto: asked });
  await shot(p, 'desktop-U4-after-sign-in', {
    act: async () => {
      await tid(p, 'sign-in-email').fill(OWNER);
      await tid(p, 'sign-in-password').fill(password);
      await tid(p, 'sign-in-password-submit').click();
      await p.waitForURL((u) => u.pathname !== '/sign-in', { timeout: 60_000 });
    },
    settle: 3000,
  });
  notes['desktop-U4-after-sign-in'].steps.push(`asked for ${asked}`);
  await ctx.close();
});
