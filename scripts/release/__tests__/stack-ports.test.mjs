// EZD-325 T1 (vault/plans/EZD-325.md section 4): every scripts/**/supabase/config.toml is one of the 2 scratch stacks,
// each of its 4 ports is a bare integer below 32768 (E3: Linux outgoing range 32768-60999, ci.yml; E4: macOS
// 49152-65535), and no port is shared between the stacks or with the main stack's supabase/config.toml.
// node:test, Node built-ins only. The parser is defined here; its control input is the plan's control row.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUTGOING_LOW = 32768; // E3: Linux ephemeral (outgoing) range starts here
const SCRATCH_STACKS = [
  'scripts/backup/scratch/supabase/config.toml',
  'scripts/release/scratch/supabase/config.toml',
];

/** Every file under `dir`, recursively, as a path relative to REPO_ROOT with '/' separators. */
function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * The values of the non-comment keys that end in `port`, in file order. A bare integer becomes a number;
 * anything else (a quoted string, a float, a word) stays text, so the assertion below rejects it.
 */
function portValues(toml) {
  const values = [];
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (!m || !m[1].endsWith('port')) continue;
    const value = m[2].replace(/\s+#.*$/, '').trim();
    values.push(/^\d+$/.test(value) ? Number(value) : value);
  }
  return values;
}

describe('EZD-325 scratch stack ports', () => {
  test('EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared', () => {
    assert.deepEqual(
      portValues('[db]\nport = 56322\n# port = 1\n'),
      [56322],
      'control: one port read, the commented line skipped',
    );

    const found = filesUnder(path.join(REPO_ROOT, 'scripts'))
      .filter((p) => /^scripts\/(?:.*\/)?supabase\/config\.toml$/.test(p))
      .sort();
    assert.deepEqual(found, [...SCRATCH_STACKS].sort(), 'scripts/**/supabase/config.toml finds the 2 scratch stacks');

    const scratchValues = [];
    for (const p of SCRATCH_STACKS) {
      const values = portValues(readFileSync(path.join(REPO_ROOT, p), 'utf8'));
      assert.equal(values.length, 4, `${p} has 4 port values`);
      for (const v of values) {
        assert.ok(Number.isInteger(v) && v < OUTGOING_LOW, `${p}: ${v} is a bare integer below ${OUTGOING_LOW} (E3, E4)`);
      }
      scratchValues.push(...values);
    }

    assert.equal(new Set(scratchValues).size, scratchValues.length, 'no port is shared between the scratch stacks');
    const main = portValues(readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8'));
    assert.deepEqual(
      scratchValues.filter((v) => main.includes(v)),
      [],
      'no scratch port is a port of supabase/config.toml',
    );
  });
});
