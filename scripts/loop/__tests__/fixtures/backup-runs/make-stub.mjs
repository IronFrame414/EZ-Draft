// Puts an executable `gh` (a shell wrapper around stub-gh.mjs) in a new temp dir; returns { gh, env, calls, done }.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function makeStubGh(stubCase) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-stub-gh-'));
  const gh = path.join(tmp, 'gh');
  writeFileSync(gh, `#!/bin/sh\nexec "${process.execPath}" "${path.join(here, 'stub-gh.mjs')}" "$@"\n`);
  chmodSync(gh, 0o755);
  const env = { ...process.env, GH_STUB_DIR: here, GH_STUB_CASE: stubCase, GH_STUB_LOG: tmp };
  const calls = () => { const f = path.join(tmp, 'calls.log'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : []; };
  return { gh, env, calls, done: () => rmSync(tmp, { recursive: true, force: true }) };
}
