// EZD-901a: the committed architect fixtures are exactly what scripts/fixtures/generate-architect.mjs writes, and
// the revised copies differ from the plan in the four ways the ticket names (one wall moved, one entity added, one
// removed, one dim value changed), once with handles and once with every handle stripped. Checked on the text with
// Node built-ins only (no DXF parser).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECT_FILE,
  ARCHITECT_REV_FILE,
  ARCHITECT_REV_NOHANDLES_FILE,
  writeArchitectFixtures,
} from '../generate-architect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const synthetic = path.resolve(here, '..', '..', '..', 'fixtures', 'synthetic');
const FILES = [ARCHITECT_FILE, ARCHITECT_REV_FILE, ARCHITECT_REV_NOHANDLES_FILE];

/** Records of the ENTITIES section as { type, groups } with group code/value pairs. */
function entities(text) {
  const lines = text.split('\n');
  const out = [];
  let inEntities = false;
  let current = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const value = lines[i + 1];
    if (code === 2 && value === 'ENTITIES' && lines[i - 1] === 'SECTION') inEntities = true;
    else if (code === 0 && value === 'ENDSEC') inEntities = false;
    else if (inEntities && code === 0) {
      current = { type: value, groups: [] };
      out.push(current);
    } else if (inEntities && current) current.groups.push([code, value]);
  }
  return out;
}
const handle = (e) => e.groups.find(([c]) => c === 5)?.[1];

describe('EZD-901a architect fixtures', () => {
  it('the committed files are the generator output', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ezd-arch-'));
    try {
      writeArchitectFixtures(dir);
      for (const f of FILES) {
        assert.equal(readFileSync(path.join(synthetic, f), 'latin1'), readFileSync(path.join(dir, f), 'latin1'), f);
        assert.equal(
          readFileSync(path.join(synthetic, `${f}.expected.json`), 'utf8'),
          readFileSync(path.join(dir, `${f}.expected.json`), 'utf8'),
          `${f}.expected.json`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the plan has 10 layers, both layouts and the unsupported LEADER in its expected counts', () => {
    const exp = JSON.parse(readFileSync(path.join(synthetic, `${ARCHITECT_FILE}.expected.json`), 'utf8'));
    assert.equal(exp.layers.length, 10);
    assert.deepEqual(
      exp.layouts.map((l) => l.block),
      ['*Paper_Space', '*Paper_Space0'],
    );
    assert.deepEqual(exp.notRead, { LEADER: 1 });
    // Model-space and active-layout records are in ENTITIES; the second layout's are in its block.
    const text = readFileSync(path.join(synthetic, ARCHITECT_FILE), 'latin1');
    const inEntities = entities(text).length;
    const layout2 = exp.layouts[1].entities;
    assert.equal(inEntities + layout2, exp.entityCount);
  });

  it('the revision moves the partition, adds a window, removes the lavatory and changes one dimension', () => {
    const plan = entities(readFileSync(path.join(synthetic, ARCHITECT_FILE), 'latin1'));
    const rev = entities(readFileSync(path.join(synthetic, ARCHITECT_REV_FILE), 'latin1'));
    const byHandle = (list) => new Map(list.map((e) => [handle(e), e]));
    const p = byHandle(plan);
    const r = byHandle(rev);
    assert.deepEqual([...r.keys()].filter((h) => !p.has(h)), ['200']);
    assert.deepEqual([...p.keys()].filter((h) => !r.has(h)), ['10E']);
    const changed = [...p.keys()].filter(
      (h) => r.has(h) && JSON.stringify(p.get(h).groups) !== JSON.stringify(r.get(h).groups),
    );
    assert.deepEqual(changed.sort(), ['108', '118']);
    const xs = (e) => e.groups.filter(([c]) => c === 10).map(([, v]) => Number(v));
    assert.deepEqual(
      xs(r.get('108')).map((x, i) => x - xs(p.get('108'))[i]),
      [6, 6, 6, 6],
    );
    const text = (e) => e.groups.find(([c]) => c === 1)[1];
    assert.equal(text(p.get('118')), "15'-0\"");
    assert.equal(text(r.get('118')), "15'-6\"");
  });

  it('the no-handles copy is the revision with every group 5 removed', () => {
    const withHandles = readFileSync(path.join(synthetic, ARCHITECT_REV_FILE), 'latin1');
    const without = readFileSync(path.join(synthetic, ARCHITECT_REV_NOHANDLES_FILE), 'latin1');
    const lines = without.split('\n');
    for (let i = 0; i + 1 < lines.length; i += 2) assert.notEqual(lines[i].trim(), '5', `group 5 at line ${i + 1}`);
    const strip = (t) =>
      entities(t).map((e) => ({ type: e.type, groups: e.groups.filter(([c]) => c !== 5) }));
    assert.deepEqual(strip(without), strip(withHandles));
  });
});
