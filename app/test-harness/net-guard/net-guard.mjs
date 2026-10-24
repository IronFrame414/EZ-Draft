// EZD-021 Step 2 (vault/plans/EZD-021.md): the live-network guard. Plain ESM with Node built-ins only, so Node can
// preload it (preload.mjs) and Vitest, Playwright and the app server share one rule: only loopback hosts are
// reachable in tests (the local Supabase, the Next server, the mail catcher). Everything else is blocked,
// recorded, and fails at once. State lives on globalThis, so every copy of this module sees one attempt list.
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

export const GUARD_MARKER = Symbol.for('ezd.netGuard.installed');
const STATE_KEY = Symbol.for('ezd.netGuard.state');

export class NetGuardError extends Error {
  constructor(host) {
    super(`Live network blocked in tests: ${host}`);
    this.name = 'NetGuardError';
    this.code = 'live_network_blocked_in_tests';
    this.host = host;
  }
}

function state() {
  const g = globalThis;
  if (!g[STATE_KEY]) g[STATE_KEY] = { attempts: [], listeners: [], installed: false };
  return g[STATE_KEY];
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True for a loopback host, and for URLs that carry no host (data:, blob:, about:). Accepts a URL, a string or a host. */
export function isLoopback(target) {
  let host;
  if (target instanceof URL) {
    if (
      target.protocol !== 'http:' &&
      target.protocol !== 'https:' &&
      target.protocol !== 'ws:' &&
      target.protocol !== 'wss:'
    ) {
      return true;
    }
    host = target.hostname;
  } else {
    const text = String(target);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      try {
        return isLoopback(new URL(text));
      } catch {
        return false;
      }
    }
    host = text;
  }
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/**
 * Every blocked attempt so far in this process.
 * @returns {Array<{ via: string, method: string, host: string, at: number }>}
 */
export function blockedAttempts() {
  return state().attempts.slice();
}

export function clearBlockedAttempts() {
  state().attempts.length = 0;
}

function block(via, method, host) {
  const s = state();
  const attempt = { via, method, host, at: Date.now() };
  s.attempts.push(attempt);
  for (const listener of s.listeners) {
    try {
      listener(attempt);
    } catch {
      // A failing listener never hides the block.
    }
  }
  return new NetGuardError(host);
}

function hostOfFetchInput(input) {
  try {
    if (input instanceof URL) return input;
    if (typeof input === 'string') return new URL(input);
    if (input && typeof input.url === 'string') return new URL(input.url);
  } catch {
    // Not a parsable absolute URL: let the real fetch reject it.
  }
  return null;
}

function methodOf(input, init) {
  const m =
    (init && init.method) ||
    (input && typeof input === 'object' && 'method' in input && input.method) ||
    'GET';
  return String(m).toUpperCase();
}

// Reads the host out of the arguments of http(s).request / get: (url[, options][, cb]) or (options[, cb]).
function requestTarget(args) {
  const [first, second] = args;
  let options = {};
  if (typeof first === 'string' || first instanceof URL) {
    try {
      const url = first instanceof URL ? first : new URL(first);
      options = { hostname: url.hostname, method: undefined };
    } catch {
      options = {};
    }
    if (second && typeof second === 'object') options = { ...options, method: second.method };
  } else if (first && typeof first === 'object') {
    options = first;
  }
  let host = String(options.hostname || options.host || 'localhost').replace(/^\[|\]$/g, '');
  if (host.split(':').length === 2) host = host.split(':')[0]; // host:port
  return { host, method: String(options.method || 'GET').toUpperCase() };
}

/**
 * Wraps globalThis.fetch, http.request/get and https.request/get. A call to a non-loopback host records an
 * attempt, calls onBlocked, and fails at once with NetGuardError (fetch rejects, request throws). Idempotent:
 * a second install wraps nothing again. The wrapped fetch carries GUARD_MARKER.
 */
export function installNetGuard({ onBlocked } = {}) {
  const s = state();
  if (onBlocked && !s.listeners.includes(onBlocked)) s.listeners.push(onBlocked);
  if (s.installed && globalThis.fetch && globalThis.fetch[GUARD_MARKER]) return;
  s.installed = true;

  const realFetch = globalThis.fetch;
  if (typeof realFetch === 'function' && !realFetch[GUARD_MARKER]) {
    const guarded = function guardedFetch(input, init) {
      const url = hostOfFetchInput(input);
      if (url && !isLoopback(url)) {
        return Promise.reject(block('fetch', methodOf(input, init), url.hostname));
      }
      return realFetch.call(this, input, init);
    };
    guarded[GUARD_MARKER] = true;
    globalThis.fetch = guarded;
  }

  for (const [mod, protocol] of [
    [http, 'http:'],
    [https, 'https:'],
  ]) {
    const via = protocol === 'http:' ? 'http' : 'https';
    for (const name of ['request', 'get']) {
      const real = mod[name];
      if (typeof real !== 'function' || real[GUARD_MARKER]) continue;
      const wrapped = function guardedRequest(...args) {
        const { host, method } = requestTarget(args);
        if (!isLoopback(host)) throw block(via, name === 'get' ? 'GET' : method, host);
        return real.apply(this, args);
      };
      wrapped[GUARD_MARKER] = true;
      mod[name] = wrapped;
    }
  }
  syncBuiltinESMExports();
}
