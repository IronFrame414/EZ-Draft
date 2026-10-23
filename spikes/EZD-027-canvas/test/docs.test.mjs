// EZD-027 D1 dependencies registered (vault/plans/EZD-027.md Step 7, Tests table; CLAUDE.md rule 7).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');

function rows() {
  const text = readFileSync(path.join(root, 'docs', 'architecture.md'), 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^\| `([^`]+)` \| `([^`]+)` \| ([^|]+) \| [^|]* \| ([^|]+) \|$/.exec(line);
    if (m) out.push({ pkg: m[1], version: m[2], usedIn: m[3].split(',').map((s) => s.trim()), addedBy: m[4].trim() });
  }
  return out;
}

describe('EZD-027 dependencies registered', () => {
  test('D1 three and @playwright/test list spikes; spike package.json matches the rows', () => {
    const r = rows();
    const pkg = JSON.parse(readFileSync(path.join(root, 'spikes', 'EZD-027-canvas', 'package.json'), 'utf8'));
    for (const name of ['three', '@playwright/test']) {
      const row = r.find((x) => x.pkg === name);
      assert.ok(row, `row ${name}`);
      assert.ok(row.usedIn.includes('spikes'), `${name} Used in has spikes`);
      assert.equal(row.addedBy, 'EZD-000');
    }
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['three']);
    assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['@playwright/test']);
    assert.equal(pkg.dependencies.three, r.find((x) => x.pkg === 'three').version);
    assert.equal(pkg.devDependencies['@playwright/test'], r.find((x) => x.pkg === '@playwright/test').version);
    assert.equal(r.filter((x) => x.addedBy === 'EZD-027').length, 0);
  });
});
