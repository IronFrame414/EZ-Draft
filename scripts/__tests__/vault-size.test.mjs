// EZD-1952 (audit 2026-11-23 B5): vault/snapshots/ and vault/archive/ live on the orphan branch `vault-archive`, not in the
// checked-out tree, so every worktree's vault stays at 45 MB or less (AC-EZD-1952-1, AC-EZD-1952-2). Reads the committed
// tree (git ls-tree), so it holds on a shallow CI clone that has no archive branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = () =>
  execFileSync('git', ['-C', root, 'ls-tree', '-r', '-l', 'HEAD', '--', 'vault'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      return { file, size: Number(meta.trim().split(/\s+/)[3]) || 0 };
    });

test('AC-EZD-1952-1 vault/snapshots/ and vault/archive/ are not in the committed tree', () => {
  const left = tracked().filter((e) => e.file.startsWith('vault/snapshots/') || e.file.startsWith('vault/archive/'));
  assert.deepEqual(left.map((e) => e.file), []);
});

test('AC-EZD-1952-2 the committed vault is 45 MB or less', () => {
  const bytes = tracked().reduce((n, e) => n + e.size, 0);
  assert.ok(bytes <= 45 * 1024 * 1024, `vault is ${(bytes / 1024 / 1024).toFixed(1)} MB`);
});
