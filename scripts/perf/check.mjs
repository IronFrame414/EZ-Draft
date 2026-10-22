// EZD-017 Step 7 (vault/plans/EZD-017.md R0-R2, K1-K4, E1, P5): runs every measurement, evaluates it against
// its budget and writes the results file on every run that passed validation. Node built-ins and the root
// devDependency @playwright/test only.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { BUDGETS } from './budgets.mjs';
import { measureJsSize } from './js-size.mjs';
import { frameStats, runPan } from './pan-script.mjs';
import { PROFILES } from './perf.config.mjs';
import { MEASUREMENTS } from './registry.mjs';

/** K4: a bad flag or config; exit 2, no results file. */
export class UsageError extends Error {}

/** K1, E1: a run error with its code; results are still written. */
class RunError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const SERVER_PORT = 3200;
const SERVER_READY_MS = 120000;
const SERVER_POLL_MS = 500;
const SERVER_KILL_MS = 5000;
// K1: the app server renders the dev and sign-in pages signed out, with no Supabase env.
const STRIPPED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_API_GATE_SECRET',
  'EZD_TEST_DB_URL',
];

/**
 * R2: evaluates InputRows against their budgets. `profile` names the device profile the rows were measured
 * with; Phase 0 has `desktop` only (G12).
 */
export function evaluate(rows, budgets = BUDGETS, profile = 'desktop') {
  void profile;
  const frame = budgets['frame.desktop'];
  const frameMax = budgets['frame.max'];
  const out = rows.map((input) => {
    const b = budgets[input.budgetId];
    const value = input.value ?? null;
    const details = input.details ?? {};
    const row = {
      id: input.id,
      status: null,
      value,
      budgetId: input.budgetId,
      budget: b.rule ?? b.value,
      unit: b.unit,
      source: b.source,
      owner: input.owner,
      details,
    };
    if (input.pending) {
      row.status = 'pending';
    } else if (input.error !== undefined) {
      row.status = 'error';
      row.error = input.error;
    } else if (b.kind === 'gate') {
      const ok = b.unit === 'relative' ? value <= details.changed : value <= b.value;
      row.status = ok ? 'pass' : 'fail';
    } else {
      row.status = 'trend';
      if (value === null) row.withinBudget = null;
      else if (input.budgetId === 'frame.desktop')
        row.withinBudget =
          value <= frame.value + frame.toleranceMs && details.stats.max <= frameMax.value;
      else row.withinBudget = b.value === null ? null : value <= b.value;
    }
    return row;
  });
  const pass = !out.some((r) => r.status === 'fail' || r.status === 'error');
  return { rows: out, pass };
}

async function loadConfig(abs) {
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    throw new UsageError(`config ${abs} could not be loaded: ${e.message}`);
  }
  const cfg = mod.default;
  if (!cfg || !Array.isArray(cfg.measurements)) {
    throw new UsageError(`config ${abs} has no measurements array in its default export`);
  }
  return cfg;
}

/** R1: the registry plus the config's measurements, then --only. */
function planRows(cfg, only) {
  const rows = MEASUREMENTS.map((m) => ({ ...m, url: undefined }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const entry of cfg.measurements) {
    if (entry.budget !== undefined && !Object.hasOwn(BUDGETS, entry.budget)) {
      throw new UsageError(`config entry ${entry.id}: budget ${entry.budget} is not in BUDGETS`);
    }
    const known = byId.get(entry.id);
    if (known) {
      known.url = entry.url;
      continue;
    }
    if (entry.budget === undefined) {
      throw new UsageError(`config entry ${entry.id} is not in the registry and has no budget`);
    }
    const row = {
      id: entry.id,
      budget: entry.budget,
      status: 'active',
      owner: 'config',
      collector: 'js-size',
      url: entry.url,
    };
    rows.push(row);
    byId.set(row.id, row);
  }
  if (!only) return rows;
  for (const id of only) {
    if (!byId.has(id)) throw new UsageError(`--only: unknown measurement ${id}`);
  }
  return rows.filter((r) => only.includes(r.id));
}

function contextOptions(profile) {
  return {
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    hasTouch: profile.hasTouch,
    isMobile: profile.isMobile,
  };
}

/** P5, H1, P3, P4: the InputRow fields of one pan row from the pan's outcome. */
function panInput(id, pan) {
  if (pan.unexpected) return { error: 'unexpected_error', details: {} };
  if (pan.error !== undefined) {
    return { error: pan.error, details: { status: pan.status, reactDetected: pan.reactDetected } };
  }
  switch (id) {
    case 'react-commits-during-pan': {
      const details = {
        reactDetected: pan.reactDetected,
        renderers: pan.renderers,
        pointerMoves: pan.pointerMoves,
      };
      return pan.reactDetected
        ? { value: pan.commits, details }
        : { error: 'react_not_detected', details };
    }
    case 'long-tasks-during-pan':
      return { value: pan.longTasksPan, details: {} };
    case 'long-tasks-during-load':
      return { value: pan.longTasksLoad, details: {} };
    case 'frame-times-during-pan': {
      const stats = frameStats(pan.intervals);
      return { value: stats.p95, details: { stats } };
    }
    default:
      throw new Error(`no pan value for ${id}`);
  }
}

const logStack = (e) => process.stderr.write(`${e?.stack ?? e}\n`);

async function collect(browser, profile, baseUrl, panUrl, plan) {
  let pan = null;
  if (plan.some((r) => r.status === 'active' && r.collector === 'pan')) {
    const context = await browser.newContext(contextOptions(profile));
    try {
      pan = await runPan(context, baseUrl, panUrl);
    } catch (e) {
      logStack(e);
      pan = { unexpected: true };
    } finally {
      await context.close();
    }
  }
  const inputs = [];
  for (const r of plan) {
    const base = { id: r.id, budgetId: r.budget, owner: r.owner };
    if (r.status === 'pending') {
      inputs.push({ ...base, pending: true });
    } else if (r.collector === 'pan') {
      inputs.push({ ...base, ...panInput(r.id, pan) });
    } else if (r.collector === 'js-size') {
      if (!r.url) {
        inputs.push({ ...base, error: 'no_url' });
        continue;
      }
      try {
        inputs.push({ ...base, ...(await measureJsSize(browser, profile, baseUrl, r.url)) });
      } catch (e) {
        logStack(e);
        inputs.push({ ...base, error: 'unexpected_error' });
      }
    } else {
      throw new Error(`active measurement ${r.id} has no collector`);
    }
  }
  return inputs;
}

async function readWebglRenderer(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? null;
      } catch {
        return null;
      }
    });
  } finally {
    await page.close();
  }
}

function gitCommit(repoRoot) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

function machineInfo() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    cpuModel: cpus[0]?.model ?? null,
    cpuCount: cpus.length,
    totalMemGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
    ci: process.env.CI !== undefined,
  };
}

/** K1: `next start` on 127.0.0.1:3200 from the existing build, ready when /dev/shell answers 200. */
export async function startAppServer(repoRoot) {
  const appDir = path.join(repoRoot, 'app');
  if (!existsSync(path.join(appDir, '.next', 'BUILD_ID'))) {
    process.stderr.write('run pnpm build first\n');
    throw new RunError('no_build');
  }
  const env = { ...process.env };
  for (const k of STRIPPED_ENV) delete env[k];
  const child = spawn(
    process.execPath,
    [
      path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next'),
      'start',
      '-p',
      String(SERVER_PORT),
      '-H',
      '127.0.0.1',
    ],
    { cwd: appDir, env, stdio: 'ignore' },
  );
  let exited = false;
  const exitedPromise = new Promise((resolve) => {
    child.once('exit', () => {
      exited = true;
      resolve();
    });
    child.once('error', () => {
      exited = true;
      resolve();
    });
  });
  const stop = async () => {
    if (exited) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), SERVER_KILL_MS);
    await exitedPromise;
    clearTimeout(timer);
  };
  const baseUrl = `http://127.0.0.1:${SERVER_PORT}`;
  const deadline = Date.now() + SERVER_READY_MS;
  while (!exited && Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/dev/shell`);
      await r.body?.cancel();
      if (r.status === 200) return { baseUrl, stop };
    } catch {
      // not listening yet
    }
    await sleep(SERVER_POLL_MS);
  }
  await stop();
  throw new RunError('server_not_ready');
}

/** K3: latest.json overwritten, the same object appended as one line to history.jsonl. */
export function writeResults(outDir, results) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(results, null, 2) + '\n');
  appendFileSync(path.join(outDir, 'history.jsonl'), JSON.stringify(results) + '\n');
}

/**
 * Validates the config (UsageError, K4), then measures, evaluates and writes the results (K3).
 * @returns {Promise<{ exitCode: 0 | 1; results: object }>}
 */
export async function runCheck(options) {
  const { repoRoot, cwd } = options;
  const configPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : path.join(repoRoot, 'scripts', 'perf', 'perf.config.mjs');
  const cfg = await loadConfig(configPath);
  const plan = planRows(cfg, options.only);
  const panUrl = options.panUrl ?? cfg.panUrl;
  const outDir = options.outDir ? path.resolve(cwd, options.outDir) : path.join(cwd, 'perf-results');
  const profile = PROFILES[cfg.profile];
  const base = path.basename(cwd);

  const results = {
    schema: 1,
    runAt: new Date().toISOString(),
    ticket: /^EZD-\d{3,4}[a-z]?$/.test(base) ? base : null,
    commit: gitCommit(repoRoot),
    config: configPath,
    profile: cfg.profile,
    viewport: profile?.viewport ?? null,
    machine: machineInfo(),
    browser: null,
    measurements: [],
    pass: false,
  };

  let server = null;
  let browser = null;
  try {
    let baseUrl = options.baseUrl;
    if (baseUrl) {
      try {
        const r = await fetch(`${baseUrl}/`);
        await r.body?.cancel();
      } catch {
        throw new RunError('base_url_unreachable');
      }
    } else {
      server = await startAppServer(repoRoot);
      baseUrl = server.baseUrl;
    }
    browser = await chromium.launch({ headless: true });
    results.browser = { name: 'chromium', version: browser.version(), webglRenderer: null };
    results.browser.webglRenderer = await readWebglRenderer(browser);
    const inputs = await collect(browser, profile, baseUrl, panUrl, plan);
    const { rows, pass } = evaluate(inputs, BUDGETS, cfg.profile);
    results.measurements = rows;
    results.pass = pass;
  } catch (e) {
    if (!(e instanceof RunError)) logStack(e);
    results.error = e instanceof RunError ? e.code : 'unexpected_error';
    results.measurements = [];
    results.pass = false;
  } finally {
    if (browser) await browser.close().catch(logStack);
    if (server) await server.stop();
  }

  writeResults(outDir, results);
  return { exitCode: results.pass ? 0 : 1, results };
}
