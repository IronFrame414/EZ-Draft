// EZD-287 (vault/plans/EZD-287.md sections 1 and 3): check that the running local Supabase stack serves this
// checkout's email templates. Node 22 built-ins only.

import { spawnSync } from 'node:child_process';
import { stackContainer } from './lane.mjs';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{ ok: boolean, status: number | null, out: string, stdout: string, stderr: string }} CliResult
 * @typedef {{ ok: true } | { ok: false, reason: 'docker_failed' | 'unmounted' | 'other_checkout' | 'bytes_differ', template: string, result?: CliResult }} TemplateCheck
 */

const ENV_PREFIX = 'GOTRUE_MAILER_TEMPLATES_';
const KONG_DIR = '/home/kong/templates/email/';

/** @returns {CliResult} */
export function dockerCli(args) {
  const r = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error.message) : '');
  return { ok: r.status === 0 && !r.error, status: r.status, out, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function inspectJson(docker, format, container) {
  const result = docker(['inspect', '-f', format, container]);
  if (!result.ok) return { result };
  try {
    const value = JSON.parse(result.stdout);
    if (Array.isArray(value)) return { value };
  } catch {
    // falls through to the failure below
  }
  return { result };
}

function realOrSelf(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * @param {{ docker: (args: string[]) => CliResult, root: string, projectId: string, lane?: number }} opts
 * @returns {TemplateCheck}
 */
export function checkTemplates({ docker, root, projectId, lane = 0 }) {
  const env = inspectJson(docker, '{{json .Config.Env}}', stackContainer('auth', projectId, lane));
  if (!env.value) return { ok: false, reason: 'docker_failed', template: '', result: env.result };
  const urls = env.value
    .filter((e) => typeof e === 'string' && e.startsWith(ENV_PREFIX) && e.includes('='))
    .map((e) => e.slice(e.indexOf('=') + 1))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (urls.length === 0) return { ok: true };

  const mounts = inspectJson(docker, '{{json .Mounts}}', stackContainer('kong', projectId, lane));
  if (!mounts.value) return { ok: false, reason: 'docker_failed', template: '', result: mounts.result };

  const prefixes = [...new Set([path.join(root, 'supabase', 'templates'), path.join(realOrSelf(root), 'supabase', 'templates')])].map(
    (p) => p + path.sep,
  );
  for (const url of urls) {
    const name = url.slice(url.lastIndexOf('/') + 1);
    const mount = mounts.value.find((m) => m && m.Destination === `${KONG_DIR}${name}`);
    if (!mount) return { ok: false, reason: 'unmounted', template: name };
    const source = String(mount.Source ?? '');
    if (!prefixes.some((p) => source.startsWith(p))) return { ok: false, reason: 'other_checkout', template: name };
    const served = docker(['exec', stackContainer('auth', projectId, lane), 'wget', '-q', '-O', '-', url]);
    let file = '';
    try {
      file = readFileSync(source, 'utf8');
    } catch {
      file = '';
    }
    if (!served.ok || served.stdout !== file) return { ok: false, reason: 'bytes_differ', template: name };
  }
  return { ok: true };
}
