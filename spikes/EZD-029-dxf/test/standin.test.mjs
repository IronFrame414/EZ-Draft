// EZD-029 T5 stand-in counts, T6 parser reads every required type (vault/plans/EZD-029.md Tests
// table; Approach Level-1 required-types table, Step 5 spike inputs). Tolerances: 1/64 in (03 rule 5),
// 1e-6 rad. The parser is createParser() (Step 3a) and the report is buildReport with defaultParser()
// (Step 3); field names are read from the installed dxf-parser 1.1.2 source, HATCH from Step 3a.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOL_RAD,
  reportFor,
  dxfPairs,
  layerTableNames,
  parseDxf,
  near,
  samePoint,
} from './helpers/common.mjs';

const { generateStandIn } = await import('../src/standin.mjs');
const { rawScan } = await import('../src/raw-scan.mjs');

// Step 5: one 100-entity unit.
const UNIT_BY_TYPE = {
  LINE: 54,
  ARC: 10,
  CIRCLE: 5,
  LWPOLYLINE: 10,
  ELLIPSE: 2,
  SPLINE: 2,
  TEXT: 5,
  MTEXT: 3,
  INSERT: 5,
  HATCH: 2,
  DIMENSION: 2,
};
const LAYER_NAMES = ['0', ...Array.from({ length: 10 }, (_, i) => `EZD-L${i}`)];
const EZD_BLOCKS = Array.from({ length: 10 }, (_, i) => `EZD_B${i}`);

function times(obj, n) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * n]));
}

function checkBlocks(blocks) {
  assert.equal(blocks.count, 13);
  assert.equal(blocks.entities, 43);
  const expected = Object.fromEntries(EZD_BLOCKS.map((b) => [b, 4]));
  expected['*D1'] = 3;
  expected['*Model_Space'] = 0;
  expected['*Paper_Space'] = 0;
  assert.deepEqual(blocks.byBlock, expected);
}

describe('EZD-029 stand-in', () => {
  test('EZD-029 T5 stand-in counts for units 1 and 10', () => {
    const one = generateStandIn({ units: 1 });
    const ten = generateStandIn({ units: 10 });

    for (const text of [one, ten]) {
      const r = rawScan(text);
      assert.equal(r.binary, false);
      assert.equal(r.header.acadVer, 'AC1015');
      assert.equal(r.header.insUnits, 1);
      const layers = layerTableNames(text);
      assert.equal(layers.length, 11);
      assert.deepEqual([...layers].sort(), [...LAYER_NAMES].sort());
      checkBlocks(r.blocks);

      const handles = dxfPairs(text)
        .filter((p) => p.code === 5)
        .map((p) => p.value.trim());
      assert.ok(handles.length >= rawScan(text).entities.total + 43, `group 5 values: ${handles.length}`);
      assert.equal(new Set(handles).size, handles.length, 'every group 5 value is unique');
    }

    const r1 = rawScan(one);
    assert.equal(r1.entities.total, 100);
    assert.deepEqual(r1.entities.byType, UNIT_BY_TYPE);
    assert.deepEqual(r1.entities.byLayer, { 'EZD-L0': 100 });
    assert.equal(r1.entities.paperSpace, 2);

    const r10 = rawScan(ten);
    assert.equal(r10.entities.total, 1000);
    assert.deepEqual(r10.entities.byType, times(UNIT_BY_TYPE, 10));
    assert.deepEqual(
      r10.entities.byLayer,
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`EZD-L${i}`, 100])),
    );
    assert.equal(r10.entities.paperSpace, 20);
  });

  test('EZD-029 T6 the parser reads every required type (report counts, through buildReport)', async () => {
    const r = await reportFor('standin-1', 'standin-1.dxf', generateStandIn({ units: 1 }));
    assert.deepEqual(r.notRead, {});
    assert.deepEqual(r.extra, {});
    assert.deepEqual(r.raw.byType, UNIT_BY_TYPE);
    assert.deepEqual(r.parsed.byType, r.raw.byType);
  });

  test('EZD-029 T6 the parser reads every required type (paper space, blocks, layers, base entities)', async () => {
    const dxf = await parseDxf(generateStandIn({ units: 1 }));

    assert.equal(dxf.entities.filter((e) => e.inPaperSpace).length, 2, 'parsed paper-space count');

    for (const b of EZD_BLOCKS) assert.equal(dxf.blocks[b]?.entities?.length, 4, `block ${b}`);
    assert.equal(dxf.blocks['*D1']?.entities?.length, 3, 'block *D1');
    const blockEntities = Object.values(dxf.blocks).reduce((n, b) => n + (b.entities?.length ?? 0), 0);
    assert.equal(blockEntities, 43);
    assert.equal(Object.keys(dxf.tables.layer.layers).length, 11);

    const first = (type) => {
      const e = dxf.entities.find((x) => x.type === type && !x.inPaperSpace);
      assert.ok(e, `a parsed model-space ${type}`);
      return e;
    };

    const line = first('LINE');
    assert.ok(samePoint(line.vertices[0], [0, 0]) && samePoint(line.vertices[1], [96, 0]), 'LINE');

    const arc = first('ARC');
    assert.ok(samePoint(arc.center, [120, 120]), 'ARC centre');
    assert.ok(near(arc.radius, 24), 'ARC radius');
    assert.ok(near(arc.startAngle, 0, TOL_RAD), 'ARC start 0 deg');
    assert.ok(near(arc.endAngle, Math.PI / 2, TOL_RAD), 'ARC end 90 deg');

    const circle = first('CIRCLE');
    assert.ok(samePoint(circle.center, [200, 120]) && near(circle.radius, 12), 'CIRCLE');

    const lw = first('LWPOLYLINE');
    assert.equal(lw.shape, true, 'LWPOLYLINE closed');
    const rect = [
      [300, 0],
      [348, 0],
      [348, 36],
      [300, 36],
    ];
    assert.equal(lw.vertices.length, 4);
    lw.vertices.forEach((v, i) => assert.ok(samePoint(v, rect[i]), `LWPOLYLINE vertex ${i}`));

    const ellipse = first('ELLIPSE');
    assert.ok(samePoint(ellipse.center, [400, 120]), 'ELLIPSE centre');
    assert.ok(samePoint(ellipse.majorAxisEndPoint, [30, 0]), 'ELLIPSE major axis');
    assert.ok(near(ellipse.axisRatio, 0.5, 1e-9), 'ELLIPSE ratio');

    const spline = first('SPLINE');
    assert.equal(spline.degreeOfSplineCurve, 3);
    const ctrl = [
      [500, 0],
      [520, 40],
      [560, 40],
      [580, 0],
    ];
    assert.equal(spline.controlPoints.length, 4);
    spline.controlPoints.forEach((p, i) => assert.ok(samePoint(p, ctrl[i]), `SPLINE control point ${i}`));
    assert.deepEqual(spline.knotValues, [0, 0, 0, 0, 1, 1, 1, 1]);

    const text = first('TEXT');
    assert.ok(samePoint(text.startPoint, [600, 0]), 'TEXT insertion');
    assert.ok(near(text.textHeight, 6), 'TEXT height');
    assert.equal(text.text, 'EZD-029 T0-0');

    const mtext = first('MTEXT');
    assert.ok(samePoint(mtext.position, [600, 60]), 'MTEXT insertion');
    assert.ok(near(mtext.height, 6), 'MTEXT height');
    assert.equal(mtext.text, 'EZD-029 M0-0');

    const insert = first('INSERT');
    assert.equal(insert.name, 'EZD_B0');
    assert.ok(samePoint(insert.position, [700, 0]), 'INSERT position');

    const dim = first('DIMENSION');
    assert.equal(dim.block, '*D1');
    assert.ok(samePoint(dim.linearOrAngularPoint1, [0, 0]), 'DIMENSION extension point 1');
    assert.ok(samePoint(dim.linearOrAngularPoint2, [96, 0]), 'DIMENSION extension point 2');

    // Recorded, not asserted (plan T6): parsed.handles.
  });

  test('EZD-029 T6 base HATCH entity parsed with createParser(): SOLID, 1 closed polyline loop, 4 vertices in order', async () => {
    const dxf = await parseDxf(generateStandIn({ units: 1 }));
    const hatch = dxf.entities.find((e) => e.type === 'HATCH' && !e.inPaperSpace);
    assert.ok(hatch, 'a parsed model-space HATCH');
    assert.equal(hatch.patternName, 'SOLID');
    assert.equal(hatch.solid, true);
    assert.equal(hatch.loops.length, 1);
    const [loop] = hatch.loops;
    assert.equal(loop.polyline, true);
    assert.equal(loop.closed, true);
    const corners = [
      [800, 0],
      [848, 0],
      [848, 48],
      [800, 48],
    ];
    assert.equal(loop.vertices.length, 4);
    loop.vertices.forEach((v, i) => assert.ok(samePoint(v, corners[i]), `HATCH vertex ${i}`));
  });
});
