// EZD-425: the lockfile holds only patched versions of the packages named by four advisories.
// Fixed-in versions come from the advisories themselves (ticket spec_ref, 2026-11-19):
//   GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8  next >=16.4.5
//   GHSA-3g3m-2fjr-6pw4                       glob >=14.0.2 (affected >=9.0.0 <=14.0.1)
//   GHSA-g3hv-75wg-m249                       minimatch >=11.0.1 (affected >=7.0.0 <11.0.1), via glob
// EZD-1934: the whole workspace, dev-only paths included (workbox-build's glob, typescript-estree's minimatch
// under eslint-config-next), is held to the same ranges by the pnpm-workspace.yaml overrides.
// Reads pnpm-lock.yaml only; never calls the npm registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lock = readFileSync(fileURLToPath(new URL('../../pnpm-lock.yaml', import.meta.url)), 'utf8');
const appPkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../app/package.json', import.meta.url)), 'utf8'));

function cmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function lockedVersions(name) {
  const re = new RegExp(`^  '?${name.replace('/', '\\/')}@(\\d+\\.\\d+\\.\\d+)[(:']`, 'gm');
  return [...new Set([...lock.matchAll(re)].map((m) => m[1]))];
}

test('next is pinned and locked at 16.4.5 or later', () => {
  assert.ok(cmp(appPkg.dependencies.next, '16.4.5') >= 0, `app/package.json next ${appPkg.dependencies.next}`);
  const versions = lockedVersions('next');
  assert.ok(versions.length > 0);
  for (const v of versions) assert.ok(cmp(v, '16.4.5') >= 0, `next ${v} in pnpm-lock.yaml`);
});

test('every locked glob in the affected major range is 14.0.2 or later', () => {
  const versions = lockedVersions('glob');
  assert.ok(versions.length > 0);
  for (const v of versions) {
    const affected = cmp(v, '9.0.0') >= 0 && cmp(v, '14.0.1') <= 0;
    assert.ok(!affected, `glob ${v} in pnpm-lock.yaml`);
  }
});

test('every glob takes minimatch 11.0.1 or later', () => {
  const snapshots = [...lock.matchAll(/^  glob@[^\n]*:\n    dependencies:\n((?:      [^\n]*\n)+)/gm)];
  assert.ok(snapshots.length > 0);
  for (const s of snapshots) {
    const mm = /minimatch: (\d+\.\d+\.\d+)/.exec(s[1]);
    assert.ok(mm, 'glob depends on minimatch');
    assert.ok(cmp(mm[1], '11.0.1') >= 0, `glob takes minimatch ${mm[1]}`);
  }
});

test('the three Sentry app packages stay at one version', () => {
  const d = appPkg.dependencies;
  assert.equal(d['@sentry/core'], d['@sentry/nextjs']);
  assert.equal(d['@sentry/browser'], d['@sentry/nextjs']);
});

// EZD-1934: any package, any path. Affected ranges from the advisories: glob >=9.0.0 <=14.0.1, minimatch >=7.0.0 <11.0.1.
test('no glob or minimatch in an advisory range is locked or depended on anywhere in the workspace', () => {
  const affected = {
    glob: (v) => cmp(v, '9.0.0') >= 0 && cmp(v, '14.0.1') <= 0,
    minimatch: (v) => cmp(v, '7.0.0') >= 0 && cmp(v, '11.0.1') < 0,
  };
  for (const [name, isAffected] of Object.entries(affected)) {
    const packages = lockedVersions(name);
    assert.ok(packages.length > 0, `${name} is in pnpm-lock.yaml`);
    const deps = [...lock.matchAll(new RegExp(`^ +${name}: '?(\\d+\\.\\d+\\.\\d+)`, 'gm'))].map((m) => m[1]);
    const imports = [...lock.matchAll(new RegExp(`^ +${name}:\\n +specifier: [^\\n]*\\n +version: (\\d+\\.\\d+\\.\\d+)`, 'gm'))].map(
      (m) => m[1],
    );
    for (const v of [...packages, ...deps, ...imports]) assert.ok(!isAffected(v), `${name} ${v} in pnpm-lock.yaml`);
  }
});
