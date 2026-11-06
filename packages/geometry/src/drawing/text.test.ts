// EZD-238 · T3, T4: text measuring and the generated font table (vault/plans/EZD-238.md section 4).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  DM_MONO_400_METRICS,
  DRAWING_FONTS,
  INSTRUMENT_SANS_600_METRICS,
  measureTextPt,
} from '../index';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '..', '..', 'scripts', 'font-metrics.mjs');
const committed = path.join(here, 'font-metrics.generated.ts');

describe('EZD-238 drawing text', () => {
  it('EZD-238 T3 measure: width is the sum of advances x size / unitsPerEm, notdef for missing code points', () => {
    expect(measureTextPt(DM_MONO_400_METRICS, `10'-6 1/2"`, 6.75)).toBeCloseTo(40.5, 9);
    expect(measureTextPt(DM_MONO_400_METRICS, `12'-0"`, 9)).toBeCloseTo(32.4, 9);
    expect(measureTextPt(DM_MONO_400_METRICS, '一', 10)).toBeCloseTo(6, 9);
    expect(measureTextPt(DM_MONO_400_METRICS, 'ä', 10)).toBeCloseTo(6, 9);
  });

  it('EZD-238 T4 font table: font-metrics script regenerates the committed file byte for byte', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd238-'));
    try {
      const out = path.join(dir, 'metrics.ts');
      const r = spawnSync(process.execPath, [script, '--out', out], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      const same = fs.readFileSync(out).equals(fs.readFileSync(committed));
      expect(same).toBe(true);

      expect(DM_MONO_400_METRICS.unitsPerEm).toBe(1000);
      expect(DM_MONO_400_METRICS.notdefAdvance).toBe(600);
      expect(DM_MONO_400_METRICS.advances[48]).toBe(600);
      expect(DM_MONO_400_METRICS.advances[0x308]).toBe(0);
      expect(Object.keys(DM_MONO_400_METRICS.advances)).toHaveLength(222);

      const bad = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' });
      expect(bad.status).toBe(2);
      expect(bad.stderr).toContain('bad argument: --bogus');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// EZD-205a · T21 (vault/plans/EZD-205a.md section 1 Decided "Font table"; section 4). Expected values: the
// Instrument Sans 600 font file numbers in plan section 2 (fontkit 2.0.4, planner 2026-11-06).
describe('EZD-205a room label font table', () => {
  it('EZD-205a T21 font table: Instrument Sans 600 advances sit beside DM Mono', () => {
    const it600 = INSTRUMENT_SANS_600_METRICS;
    expect(it600.unitsPerEm).toBe(1000);
    expect(it600.notdefAdvance).toBe(665);
    expect(it600.advances[82]).toBe(664);
    expect(it600.advances[0xb7]).toBe(144);
    expect(Object.keys(it600.advances)).toHaveLength(209);
    expect(measureTextPt(it600, 'R1 \u00b7 120 SF', 11.25)).toBeCloseTo(52.0425, 9);
    expect(Object.keys(DRAWING_FONTS)).toEqual(['dm-mono-400', 'instrument-sans-600']);
  });
});
