// EZD-402 (AC-EZD-402-1 "Run total computes from boxes and fillers in unit tests"). Expected values are hand sums of
// the widths typed below. The main run is board S04's back wall run: a 3" scribe filler (1/2" scribe), B15, DW24,
// SB36, B18 and B21, chain 3 + 15 + 24 + 36 + 18 + 21 = 117", "Box 3 of 5" for SB36; and AC-EZD-407-1's "117" run with
// 1/2" scribe".
import { describe, expect, it } from 'vitest';
import type { CabinetBoxType, ModelObject } from '../schema';
import {
  cabinetBoxPosition,
  cabinetRowSummary,
  cabinetRunSummary,
  cabinetRunTotal,
  objectLookup,
  type CabinetRun,
} from './run';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
let n = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const box = (code: string, width: number, boxType: CabinetBoxType = 'base'): ModelObject => ({
  id: nextId(),
  type: 'cabinet_box',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code,
      boxType,
      width,
      depth: boxType === 'wall' ? 12 : 24,
      height: boxType === 'wall' ? 30 : 34.5,
      faceLayout: 'door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});
const filler = (width: number, scribe: number): ModelObject => ({
  id: nextId(),
  type: 'cabinet_filler',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code: `F${width}`,
      width,
      depth: 24,
      height: 34.5,
      scribe,
      catalogItemId: null,
      finish: null,
    },
  },
});
const endPanel = (): ModelObject => ({
  id: nextId(),
  type: 'cabinet_panel',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      kind: 'end',
      code: 'EP',
      width: 0.75,
      depth: 24,
      height: 34.5,
      catalogItemId: null,
      finish: null,
    },
  },
});
const run = (base: ModelObject[], upper: ModelObject[] = [], extraIds: string[] = []): CabinetRun => ({
  id: nextId(),
  type: 'cabinet_run',
  data: {
    geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
    level: LEVEL,
    attributes: {
      name: 'Back wall run',
      base: [...base.map((o) => o.id), ...extraIds],
      upper: upper.map((o) => o.id),
    },
  },
});

const backWall = () => {
  const f3 = filler(3, 0.5);
  const sb36 = box('SB36', 36, 'sink_base');
  const base = [
    f3,
    box('B15', 15),
    box('DW24', 24, 'appliance_panel'),
    sb36,
    box('B18', 18),
    box('B21', 21),
  ];
  const upper = [box('W1530', 15, 'wall'), box('W3630', 36, 'wall')];
  const r = run(base, upper);
  return { r, sb36, lookup: objectLookup([r, ...base, ...upper]) };
};

describe('EZD-402 cabinet run total (AC-EZD-402-1)', () => {
  it('board S04 back wall run: boxes 114" plus a 3" filler is a 117" run with 1/2" scribe', () => {
    const { r, lookup } = backWall();
    expect(cabinetRunTotal(r, lookup)).toBe(117);
    expect(cabinetRunSummary(r, lookup)).toMatchObject({
      name: 'Back wall run',
      total: 117,
      boxCount: 5,
      fillerCount: 1,
      scribe: 0.5,
    });
  });

  it('the upper row has its own total and does not add to the run total', () => {
    const { r, lookup } = backWall();
    const s = cabinetRunSummary(r, lookup);
    expect(s.upper).toEqual({ total: 51, boxCount: 2, fillerCount: 0, scribe: 0, missing: [] });
    expect(s.base.total).toBe(117);
  });

  it('fillers at both walls add their widths and their scribe', () => {
    const r1 = [filler(3, 0.5), box('B36', 36), box('B24', 24), filler(1.5, 0.75)];
    const r = run(r1);
    const s = cabinetRowSummary(r, 'base', objectLookup([r, ...r1]));
    // 3 + 36 + 24 + 1 1/2 = 64 1/2"; scribe 1/2 + 3/4 = 1 1/4".
    expect(s).toEqual({ total: 64.5, boxCount: 2, fillerCount: 2, scribe: 1.25, missing: [] });
  });

  it('a custom 16 1/2" box (outside the 3" steps) adds its exact width', () => {
    const members = [box('B16-1/2', 16.5), box('B24', 24)];
    const r = run(members);
    expect(cabinetRunTotal(r, objectLookup([r, ...members]))).toBe(40.5);
  });

  it('a 1/16" width is kept: 15 1/16 + 3 = 18 1/16"', () => {
    const members = [box('B15', 15.0625), filler(3, 0)];
    const r = run(members);
    expect(cabinetRunTotal(r, objectLookup([r, ...members]))).toBe(18.0625);
  });

  it('end panels are part of the run total; a tall box counts once', () => {
    const members = [endPanel(), box('T1884', 18, 'tall'), box('B30', 30), endPanel()];
    const r = run(members);
    const s = cabinetRunSummary(r, objectLookup([r, ...members]));
    // 3/4 + 18 + 30 + 3/4 = 49 1/2".
    expect(s.total).toBe(49.5);
    expect(s.boxCount).toBe(2);
    expect(s.fillerCount).toBe(0);
  });

  it('an empty run totals 0"', () => {
    const r = run([]);
    expect(cabinetRunSummary(r, objectLookup([r]))).toMatchObject({
      total: 0,
      boxCount: 0,
      fillerCount: 0,
      scribe: 0,
    });
  });

  it('an id not in the model, or not a run member, adds nothing and is listed as missing', () => {
    const members = [box('B24', 24), filler(3, 0.5)];
    const gone = '00000000-0000-4000-8000-999999999999';
    const r = run(members, [], [gone]);
    const lookup = objectLookup([r, ...members]);
    const s = cabinetRowSummary(r, 'base', lookup);
    expect(s.total).toBe(27);
    expect(s.missing).toEqual([gone]);

    const self = run([], [], []);
    const wrong = run([], [], [self.id]);
    expect(cabinetRowSummary(wrong, 'base', objectLookup([self, wrong])).missing).toEqual([
      self.id,
    ]);
  });

  it('ids are matched without case', () => {
    const b = box('B24', 24);
    const r = run([]);
    r.data.attributes.base = [b.id.toUpperCase()];
    expect(cabinetRunTotal(r, objectLookup([r, b]))).toBe(24);
  });
});

describe('EZD-402 box position ("Box 3 of 5")', () => {
  it('SB36 is box 3 of 5 in the base row; fillers are not counted', () => {
    const { r, sb36, lookup } = backWall();
    expect(cabinetBoxPosition(r, sb36.id, lookup)).toEqual({ row: 'base', n: 3, of: 5 });
  });

  it('an upper box counts among the upper row; an id not in the run is null', () => {
    const { r, lookup } = backWall();
    const w3630 = r.data.attributes.upper[1] as string;
    expect(cabinetBoxPosition(r, w3630, lookup)).toEqual({ row: 'upper', n: 2, of: 2 });
    expect(cabinetBoxPosition(r, r.data.attributes.base[0] as string, lookup)).toBeNull();
    expect(cabinetBoxPosition(r, nextId(), lookup)).toBeNull();
  });
});
