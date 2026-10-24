// EZD-027 U5 (camera path) and U6 (frame statistics) (vault/plans/EZD-027.md Step 5, Tests table).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt } from '../public/camera-script.mjs';
import { frameStats } from '../public/stats.mjs';

// The plan writes the result as "(cx, cy, zoom)"; accept an array or an object with those keys.
function read(c) {
  return Array.isArray(c) ? [c[0], c[1], c[2]] : [c.cx, c.cy, c.zoom];
}

describe('EZD-027 camera path and frame statistics', () => {
  test('U5 camera path', () => {
    const rows = [
      [0, 240, 360, 1],
      [750, 480, 360, 1],
      [1500, 720, 360, 1],
      [1875, 720, 360, 2.828427],
      [2250, 720, 360, 8],
      [2625, 720, 360, 2.828427],
      [3000, 720, 360, 1],
    ];
    for (const [t, cx, cy, zoom] of rows) {
      const got = read(cameraAt(t));
      assert.ok(Math.abs(got[0] - cx) < 1e-6, `t=${t} cx ${got[0]}`);
      assert.ok(Math.abs(got[1] - cy) < 1e-6, `t=${t} cy ${got[1]}`);
      assert.ok(Math.abs(got[2] - zoom) < 1e-6, `t=${t} zoom ${got[2]}`);
    }
  });

  test('U6 frame statistics', () => {
    const a = frameStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(a.count, 10);
    assert.equal(a.mean, 55);
    assert.equal(a.p50, 50);
    assert.equal(a.p95, 100);
    assert.equal(a.p99, 100);
    assert.equal(a.max, 100);
    assert.equal(a.over16_7, 9);
    assert.equal(a.over33_3, 7);
    assert.equal(a.over100, 0);
    const b = frameStats([16.66, 16.67, 33.33, 33.34, 100, 100.01]);
    assert.equal(b.over16_7, 5);
    assert.equal(b.over33_3, 3);
    assert.equal(b.over100, 1);
  });
});
