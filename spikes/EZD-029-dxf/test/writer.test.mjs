// EZD-029 T8 writer round trip (vault/plans/EZD-029.md Tests table; Approach Level-1 writer
// requirements, Step 6). Lines, door arc and room polygon: EZD-016b Step 3, read from the hand-written
// fixtures/synthetic/room-12x10.dxf.expected.json. Texts and the Z-MARKUP-WP rectangle: Step 6 spike
// inputs; layer name Z-MARKUP-WP from S11 Controls. Units inches ($INSUNITS 1; 03 rule 5, S11).
// writeRoom(writerModule) and WRITER_PACKAGE: Step 6; parser createParser() and buildReport with
// defaultParser(): Steps 3, 3a.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  spikeDir,
  fixtureExpected,
  TOL_RAD,
  reportFor,
  layerTableNames,
  parseDxf,
  near,
  samePoint,
  samePointSet,
  sameSegmentSet,
} from './helpers/common.mjs';

const { rawScan } = await import('../src/raw-scan.mjs');
const { writeRoom, WRITER_PACKAGE } = await import('../src/write-room.mjs');
const expected = JSON.parse(await readFile(fixtureExpected, 'utf8'));

const LAYERS = ['WALLS', 'DOORS', 'WINDOWS', 'ROOMS', 'Z-MARKUP-WP'];
const BY_LAYER = { WALLS: 16, DOORS: 2, WINDOWS: 3, ROOMS: 3, 'Z-MARKUP-WP': 2 };
const MARKUP_RECT = [
  [96, 72],
  [132, 72],
  [132, 108],
  [96, 108],
];
const TEXTS = [
  { layer: 'ROOMS', text: 'EZD-029 ROOM', at: [72, 60], height: 6 },
  { layer: 'Z-MARKUP-WP', text: 'EZD-029 MARKUP', at: [96, 112], height: 4 },
];
const committedFile = path.join(spikeDir, 'out', 'room-written.dxf');

async function checkWritten(text, label) {
  const raw = rawScan(text);
  assert.equal(raw.header.insUnits, 1, '$INSUNITS');
  const tableLayers = layerTableNames(text);
  for (const l of LAYERS) assert.ok(tableLayers.includes(l), `LAYER table has ${l}`);
  assert.equal(raw.entities.total, 26);
  assert.deepEqual(raw.entities.byLayer, BY_LAYER);
  const fills = (raw.entities.byType.HATCH ?? 0) + (raw.entities.byType.SOLID ?? 0);
  assert.equal(fills, 1, '1 fill (HATCH or SOLID)');

  // Report (Step 3): everything written is read back.
  const r = await reportFor(label, 'room-written.dxf', text);
  assert.equal(r.parsed.total, 26);
  assert.deepEqual(r.notRead, {});
  assert.deepEqual(r.extra, {});

  const dxf = await parseDxf(text);
  const ofType = (...types) => dxf.entities.filter((e) => types.includes(e.type));
  const parsedByLayer = {};
  for (const e of dxf.entities) parsedByLayer[e.layer ?? '0'] = (parsedByLayer[e.layer ?? '0'] ?? 0) + 1;
  assert.deepEqual(parsedByLayer, BY_LAYER, 'parsed by layer');

  const lines = ofType('LINE');
  assert.equal(lines.length, 20, 'LINE 20');
  for (const layer of ['WALLS', 'DOORS', 'WINDOWS']) {
    const segs = lines.filter((e) => e.layer === layer).map((e) => [e.vertices[0], e.vertices[1]]);
    assert.ok(sameSegmentSet(segs, expected.lines[layer]), `${layer} lines equal EZD-016b Step 3`);
  }

  const arcs = ofType('ARC');
  assert.equal(arcs.length, 1, 'ARC 1');
  const arc = arcs[0];
  assert.equal(arc.layer, expected.arc.layer);
  assert.ok(samePoint(arc.center, expected.arc.center), 'ARC centre');
  assert.ok(near(arc.radius, expected.arc.radius), 'ARC radius');
  assert.ok(near(arc.startAngle, (expected.arc.startAngleDeg * Math.PI) / 180, TOL_RAD), 'ARC start');
  assert.ok(near(arc.endAngle, (expected.arc.endAngleDeg * Math.PI) / 180, TOL_RAD), 'ARC end');

  const polys = ofType('LWPOLYLINE', 'POLYLINE');
  assert.equal(polys.length, 2, '2 closed polylines');
  for (const p of polys) assert.equal(p.shape, true, `${p.type} on ${p.layer} closed`);
  const roomPoly = polys.filter((p) => p.layer === 'ROOMS');
  const markupPoly = polys.filter((p) => p.layer === 'Z-MARKUP-WP');
  assert.equal(roomPoly.length, 1);
  assert.equal(markupPoly.length, 1);
  assert.ok(samePointSet(roomPoly[0].vertices, expected.roomPolygon.vertices), 'ROOMS polyline');
  assert.ok(samePointSet(markupPoly[0].vertices, MARKUP_RECT), 'Z-MARKUP-WP polyline');

  const texts = ofType('TEXT', 'MTEXT');
  assert.equal(texts.length, 2, '2 text entities');
  for (const want of TEXTS) {
    const t = texts.find((e) => e.text === want.text);
    assert.ok(t, `text ${want.text}`);
    assert.equal(t.layer, want.layer);
    const at = t.type === 'TEXT' ? t.startPoint : t.position;
    const height = t.type === 'TEXT' ? t.textHeight : t.height;
    assert.ok(samePoint(at, want.at), `${want.text} position`);
    assert.ok(near(height, want.height), `${want.text} height`);
  }

  if (raw.entities.byType.SOLID === 1) {
    const solids = ofType('SOLID');
    assert.equal(solids.length, 1);
    assert.equal(solids[0].layer, 'ROOMS');
    assert.ok(samePointSet(solids[0].points, expected.roomPolygon.vertices), 'SOLID corners = room corners');
  }
  if (raw.entities.byType.HATCH === 1) {
    const hatches = ofType('HATCH');
    assert.equal(hatches.length, 1);
    assert.equal(hatches[0].layer, 'ROOMS');
    assert.equal(hatches[0].solid, true);
    assert.equal(hatches[0].loops.length, 1);
    assert.ok(
      samePointSet(hatches[0].loops[0].vertices, expected.roomPolygon.vertices),
      'HATCH boundary = room corners',
    );
  }
}

describe('EZD-029 writer', () => {
  test('EZD-029 T8 writer round trip: writeRoom(writer module) re-parsed by the parser', async () => {
    const text = writeRoom(await import(WRITER_PACKAGE));
    assert.equal(typeof text, 'string');
    await checkWritten(text, 'written');
  });

  test('EZD-029 T8 writer round trip: the committed out/room-written.dxf gives the same results', async () => {
    await checkWritten(await readFile(committedFile, 'utf8'), 'committed');
  });
});
