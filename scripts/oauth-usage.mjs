#!/usr/bin/env node
// OAuth usage fallback (vault/PROCESS.md section 11 source 2; PA3-MECHANISMS.md Item 1b and rule 8).
// Reads Claude's usage endpoint when the status line has not refreshed. The sign-in token is read only when a request
// is due, held in one local variable, and never written to any file, log, output or report.
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const POLL_INTERVAL_MS = 900_000;
export const AUTH_STOP_MS = 3_600_000;
export const RETRY_FLOOR_S = 120;
export const RETRY_PAD_S = 30;
export const KEYCHAIN_SERVICE = 'Claude Code-credentials';
export const STATE_FILE = 'vault/cost/oauth-poll.json';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NO_TOKEN_LINE = 'OAuth usage fallback off: no sign-in token in ~/.claude/.credentials.json or the Keychain; gating stays on the next source';

export function retryWaitMs(retryAfter, now = new Date()) {
  let s = 0;
  const v = typeof retryAfter === 'string' ? retryAfter.trim() : '';
  if (/^\d+$/.test(v)) s = parseInt(v, 10);
  else if (v) {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) s = Math.max(0, Math.ceil((t - now.getTime()) / 1000));
  }
  return (Math.max(s, RETRY_FLOOR_S) + RETRY_PAD_S) * 1000;
}

function tokenFrom(text) {
  try {
    const t = JSON.parse(text)?.claudeAiOauth?.accessToken;
    return typeof t === 'string' && t ? t : null;
  } catch {
    return null;
  }
}

export function readToken({ home = os.homedir(), platform = process.platform, exec = spawnSync } = {}) {
  try {
    const t = tokenFrom(readFileSync(path.join(home, '.claude', '.credentials.json'), 'utf8'));
    if (t) return { token: t, source: 'file' };
  } catch {}
  if (platform === 'darwin') {
    try {
      const r = exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
      if (r && r.status === 0) {
        const t = tokenFrom(String(r.stdout ?? '').trim());
        if (t) return { token: t, source: 'keychain' };
      }
    } catch {}
  }
  return { token: null, source: null };
}

function win(w) {
  if (!w || typeof w !== 'object' || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return null;
  const r = w.resets_at;
  const ms = typeof r === 'number' ? r * 1000 : typeof r === 'string' ? Date.parse(r) : NaN;
  if (!Number.isFinite(ms)) return null;
  return { pct: w.used_percentage, resets_at: new Date(ms).toISOString() };
}

export function parseUsage(body) {
  if (!body || typeof body !== 'object') return null;
  const five_hour = win(body.five_hour), seven_day = win(body.seven_day);
  if (!five_hour || !seven_day) return null;
  return { five_hour, seven_day, fable_seven_day: null };
}

function writeJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, file);
}

const utc = (d) => d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export function createOAuthFallback({ notify = () => {}, log = () => {}, fetch = globalThis.fetch, readToken: read = readToken } = {}) {
  let noTokenLogged = false;
  return async function fallback({ root = ROOT, now = new Date() } = {}) {
    try {
      const stateFile = path.join(root, STATE_FILE);
      let state = null;
      try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
      if (state && now.getTime() < Date.parse(state.next_allowed_at)) return null;
      const save = (waitMs, last_result) => {
        writeJson(stateFile, { next_allowed_at: new Date(now.getTime() + waitMs).toISOString(), last_result, updated_at: now.toISOString() });
        return new Date(now.getTime() + waitMs);
      };
      const { token } = read();
      if (!token) {
        save(POLL_INTERVAL_MS, 'no-token');
        if (!noTokenLogged) { noTokenLogged = true; log(NO_TOKEN_LINE); }
        return null;
      }
      let res;
      try {
        res = await fetch(USAGE_URL, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
      } catch (e) {
        const next = save(POLL_INTERVAL_MS, 'error');
        log(`OAuth usage poll failed (network error); next poll after ${next.toISOString()}`);
        return null;
      }
      if (res.status === 200) {
        let usage = null;
        try { usage = parseUsage(JSON.parse(await res.text())); } catch {}
        const next = save(POLL_INTERVAL_MS, usage ? 200 : 'unreadable');
        if (!usage) {
          log(`OAuth usage poll: response had no readable five-hour and weekly windows; next poll after ${next.toISOString()}`);
          return null;
        }
        const meters = { ...usage, read_at: now.toISOString(), source: 'oauth' };
        writeJson(path.join(root, 'vault/cost/usage.json'), { five_hour: usage.five_hour, seven_day: usage.seven_day, fable_seven_day: usage.fable_seven_day, read_at: meters.read_at, source: 'oauth' });
        return { source: 'oauth', read_at: meters.read_at, five_hour: usage.five_hour, seven_day: usage.seven_day, fable_seven_day: usage.fable_seven_day, warning: null };
      }
      if (res.status === 429) {
        const ra = res.headers.get('retry-after');
        const next = save(retryWaitMs(ra, now), 429);
        log(`OAuth usage poll: rate-limited (429, Retry-After ${ra ?? 'none'}); next poll after ${next.toISOString()}`);
        return null;
      }
      if (res.status === 401 || res.status === 403) {
        const next = save(AUTH_STOP_MS, res.status);
        notify(`usage endpoint refused the sign-in (${res.status}); usage polling paused until ${utc(next)}. Gating uses the statusline or the dollar proxy meanwhile. Check that Claude Code is signed in on this machine.`);
        log(`OAuth usage poll: ${res.status}; no poll until ${next.toISOString()}`);
        return null;
      }
      const next = save(POLL_INTERVAL_MS, res.status);
      log(`OAuth usage poll failed (${res.status}); next poll after ${next.toISOString()}`);
      return null;
    } catch (e) {
      try { log(`OAuth usage poll error (${e?.name ?? 'Error'})`); } catch {}
      return null;
    }
  };
}

function walk(dir, out) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    const p = path.join(dir, n);
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push(p);
  }
}

export async function probe({ root = ROOT, fetch = globalThis.fetch, readToken: read, platform = process.platform, exec = spawnSync } = {}) {
  read ??= () => readToken({ platform, exec });
  const lines = [];
  const { token, source } = read();
  lines.push(`credential source: ${source ?? 'none'}`);
  if (platform === 'darwin') {
    let state = 'not found';
    try {
      const r = exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
      if (r && r.status === 0) state = tokenFrom(String(r.stdout ?? '').trim()) ? 'found, credentials JSON' : 'found, not the credentials JSON';
    } catch {}
    lines.push(`keychain service: ${KEYCHAIN_SERVICE} (${state})`);
  }
  if (!token) {
    lines.push('HTTP status: not requested (no token)');
  } else {
    let res = null;
    try {
      res = await fetch(USAGE_URL, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    } catch (e) {
      lines.push(`HTTP status: network error (${e?.name ?? 'Error'})`);
    }
    if (res) {
      lines.push(`HTTP status: ${res.status}`);
      let body = null;
      try { body = JSON.parse(await res.text()); } catch {}
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const keys = Object.keys(body);
        lines.push(`response keys: ${keys.join(', ')}`);
        const objs = keys.filter((k) => body[k] && typeof body[k] === 'object' && !Array.isArray(body[k]));
        lines.push(`window keys: ${objs.map((k) => `${k}{${Object.keys(body[k]).join(', ')}}`).join('; ')}`);
        const model = keys.filter((k) => k.startsWith('seven_day_'));
        lines.push(`model-scoped weekly window: ${model.length ? model.join(', ') : 'none found'}`);
      }
    }
  }
  let hits = 'none';
  if (token) {
    const files = [];
    for (const d of ['vault', 'scripts', '.run']) if (existsSync(path.join(root, d))) walk(path.join(root, d), files);
    const found = [];
    for (const f of files) {
      try { if (readFileSync(f, 'utf8').includes(token)) found.push(path.relative(root, f)); } catch {}
    }
    if (found.length) hits = found.join(', ');
  }
  lines.push(`token found in files under vault/, scripts/, .run/: ${hits}`);
  return lines;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes('--probe')) {
  for (const l of await probe()) console.log(l);
}
