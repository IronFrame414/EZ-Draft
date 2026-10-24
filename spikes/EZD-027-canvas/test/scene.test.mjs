// EZD-027 U1-U4 (vault/plans/EZD-027.md Tests table; Step 3).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneData, canvasRegion } from '../public/scene-data.mjs';

describe('EZD-027 scene data', () => {
  test('U1 scene data: 150,000 segments, 3,000 symbols, 3,000 labels', () => {
    const s = buildSceneData({ seed: 27, labels: 3000 });
    assert.equal(s.layers.length, 10);
    let segments = 0;
    for (const layer of s.layers) {
      assert.ok(layer instanceof Float32Array);
      assert.equal(layer.length, 90000);
      for (let i = 0; i < layer.length; i += 6) {
        segments++;
        const [x1, y1, z1, x2, y2, z2] = [0, 1, 2, 3, 4, 5].map((k) => layer[i + k]);
        assert.equal(z1, 0);
        assert.equal(z2, 0);
        for (const x of [x1, x2]) assert.ok(x >= 0 && x <= 960, `x ${x}`);
        for (const y of [y1, y2]) assert.ok(y >= 0 && y <= 720, `y ${y}`);
        assert.ok(Math.hypot(x2 - x1, y2 - y1) >= 6 - 1e-4, 'segment shorter than 6 in');
      }
    }
    assert.equal(segments, 150000);
    assert.equal(s.symbols.length, 3000);
    const perType = new Array(10).fill(0);
    for (const sym of s.symbols) {
      perType[sym.type]++;
      assert.ok(sym.x >= 0 && sym.x <= 960 && sym.y >= 0 && sym.y <= 720);
    }
    assert.deepEqual(perType, new Array(10).fill(300));
    assert.equal(s.labels.length, 3000);
    let chars = 0;
    for (const l of s.labels) {
      assert.match(l, /^S\d-\d{5}$/);
      chars += l.length;
    }
    assert.equal(chars, 24000);
  });

  test('U2 same input everywhere', () => {
    const a = buildSceneData({ seed: 27, labels: 3000 });
    const b = buildSceneData({ seed: 27, labels: 3000 });
    const c = buildSceneData({ seed: 28, labels: 3000 });
    for (let i = 0; i < 10; i++) {
      assert.equal(Buffer.compare(Buffer.from(a.layers[i].buffer), Buffer.from(b.layers[i].buffer)), 0);
    }
    assert.deepEqual(a.symbols, b.symbols);
    assert.deepEqual(a.labels, b.labels);
    const differs = a.layers.some(
      (l, i) => Buffer.compare(Buffer.from(l.buffer), Buffer.from(c.layers[i].buffer)) !== 0,
    );
    assert.ok(differs);
  });

  test('U3 line buffer size', () => {
    const s = buildSceneData({ seed: 27, labels: 3000 });
    let sum = 0;
    for (const l of s.layers) {
      assert.equal(l.byteLength, 360000);
      sum += l.byteLength;
    }
    assert.equal(sum, 3600000);
  });

  test('U4 canvas region', () => {
    assert.deepEqual(canvasRegion(1600, 1000), { x: 352, y: 92, width: 880, height: 846 });
    assert.deepEqual(canvasRegion(1180, 820), { x: 352, y: 92, width: 460, height: 666 });
    assert.deepEqual(canvasRegion(1440, 960), { x: 352, y: 92, width: 720, height: 806 });
  });
});
