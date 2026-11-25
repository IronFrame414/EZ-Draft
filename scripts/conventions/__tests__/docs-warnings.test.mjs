// EZD-1957 (audit 2026-11-23 U10, O7): the mockup index warns about the S03 icon-name glitch, and SETUP.md warns that
// the base local stack (lane 0) is not the lanes' stack and needs `pnpm db:up` before an interactive UI check.
// Expected texts come from AC-EZD-1957-1 and AC-EZD-1957-2. Each test reads the file fresh.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const lineWith = (text, needle) => text.split('\n').find((l) => l.includes(needle));

describe('EZD-1957 docs warnings', () => {
  it('AC-EZD-1957-1: the mockup index notes the raw more_hori text on S03Plan.png', () => {
    const line = lineWith(read('vault/mockups/INDEX.md'), 'more_hori`');
    assert.ok(line, 'INDEX.md has a line naming `more_hori`');
    for (const want of ['S03Plan.png', 'bottom right', 'inspector', 'more-horizontal icon', 'do not copy the text']) {
      assert.ok(line.includes(want), `the note says "${want}"`);
    }
  });

  it('AC-EZD-1957-2: SETUP.md says lane 0 is not used by lanes 1-3 and needs pnpm db:up before a UI check', () => {
    const line = lineWith(read('SETUP.md'), 'base local Supabase stack');
    assert.ok(line, 'SETUP.md has a line about the base local Supabase stack');
    for (const want of ['lane 0', 'port 54321', 'not used by lanes 1-3', '`pnpm db:up`', 'interactive UI check',
      '133 of 156 migrations', 'stale gate secret']) {
      assert.ok(line.includes(want), `the warning says "${want}"`);
    }
  });
});
