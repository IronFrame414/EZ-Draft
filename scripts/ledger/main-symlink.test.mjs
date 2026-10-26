// EZD-155 T10, T11: vault/tools/next_ticket.mjs counts as "main" when started through a symlinked path, and importing it runs
// no CLI (vault/plans/EZD-155.md sections 3 and 4; Q-0268 sweep item 45). Both runs are read-only (`--check`, an import).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(repo, 'vault/tools/next_ticket.mjs');
let tmp;
const node = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000 });

before(() => {
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd155-')));
  symlinkSync(path.join(repo, 'vault/tools'), path.join(tmp, 'tools-link'), 'dir');
  writeFileSync(path.join(tmp, 'importer.mjs'), `await import(${JSON.stringify(pathToFileURL(tool).href)});\n`);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('EZD-155 T10 the ledger tool prints its report through a symlink (AC-EZD-155-3)', () => {
  const viaLink = node(path.join(tmp, 'tools-link/next_ticket.mjs'), '--check');
  const direct = node(tool, '--check');
  assert.equal(viaLink.status, direct.status, `${viaLink.stderr}\n${direct.stderr}`);
  assert.equal(viaLink.stdout, direct.stdout);
  assert.ok(direct.stdout.startsWith('LEDGER OK') || direct.stdout.startsWith('LEDGER INVALID'), direct.stdout);
});

test('EZD-155 T11 importing the ledger tool runs no CLI (control, AC-EZD-155-3)', () => {
  const r = node(path.join(tmp, 'importer.mjs'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
