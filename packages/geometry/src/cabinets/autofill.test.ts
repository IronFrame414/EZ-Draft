// EZD-408 (AC-EZD-408-1 "Cabinets acceptance test passes: a 117 1/2" empty wall returns boxes whose widths are
// multiples of 3" plus fillers, with the total inside the scribe allowance"; 12 Acceptance · Cabinets "Auto-fill of a
// 117 1/2" wall yields boxes in 3" increments plus filler, total shown vs wall"; phase-04 EZD-408 rule "fill from the
// left with the widest box of the active line that fits; keep placed appliances, sink bases and openings; put the
// remainder into fillers at the wall ends"). The line is the seeded generic one (B9 to B36, F3; EZD-401). Every
// expected row is worked by hand:
// - 117 1/2" wall: F3 at each end leaves 111 1/2"; 36 (75 1/2 left), 36 (39 1/2), 36 (3 1/2), then no box fits.
//   Left over after the boxes: 117 1/2 - 108 = 9 1/2 = F3 + 6 1/2 at the far end: one more whole 3" makes it F6,
//   and the last 1/2" is its scribe. Total 3 + 108 + 6 = 117, gap 1/2" = scribe: board S04's "Run 117" fits wall
//   117 1/2" · 1/2" scribe".
import { describe, expect, it } from 'vitest';
import type { ModelObject } from '../schema';
import { createWallData } from '../walls/wall';
import { cabinetRunFit } from './fit';
import {
  cabinetAutoFill,
  cabinetFillBoxWidths,
  cabinetFillLine,
  cabinetFillWidths,
  type CabinetFillSlot,
} from './autofill';
import type { CabinetRun } from './run';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const WALL = 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45';
let n = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

// A wall along +x from (0,0), 4 1/2" thick to its right (y < 0): a run started on its line stands on y > 0.
function wall(length: number): ModelObject {
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: length, y: 0 },
    level: LEVEL,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall');
  return {
    id: WALL,
    type: 'wall',
    data: { ...made.data, attributes: { ...made.data.attributes, thickness: 4.5 } },
  };
}

const box = (code: string, width: number, boxType = 'base'): ModelObject =>
  ({
    id: nextId(),
    type: 'cabinet_box',
    data: {
      status: 'new',
      level: LEVEL,
      attributes: {
        code,
        boxType,
        width,
        depth: 24,
        height: 34.5,
        faceLayout: 'door_1',
        hingeSide: 'left',
        finishedEnds: 'none',
        catalogItemId: null,
        finish: null,
      },
    },
  }) as ModelObject;

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

function run(base: ModelObject[]): CabinetRun {
  return {
    id: nextId(),
    type: 'cabinet_run',
    data: {
      geometry: { hostWallId: WALL, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
      level: LEVEL,
      attributes: { name: 'Back wall run', base: base.map((o) => o.id), upper: [] },
    },
  };
}

function opening(kind: 'door' | 'window', x: number, width: number, sill: number): ModelObject {
  return {
    id: nextId(),
    type: 'opening',
    data: {
      geometry: { center: { x, y: 0 }, hostWallId: WALL, axis: null },
      status: 'existing',
      level: LEVEL,
      attributes: {
        kind,
        width,
        height: kind === 'door' ? 80 : 36,
        roughOpening: { width: width + 2, height: 82 },
        sillHeight: sill,
        swing: kind === 'door' ? 'left' : null,
        hand: kind === 'door' ? 'left' : null,
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    },
  } as ModelObject;
}

function fixture(kind: string, x: number, y: number, width: number): ModelObject {
  return {
    id: nextId(),
    type: 'fixture',
    data: {
      geometry: { center: { x, y }, axis: { x: 1, y: 0 } },
      status: 'new',
      level: LEVEL,
      attributes: { kind, width, depth: 26 },
    },
  } as ModelObject;
}

// The slots as short text: B36, F6/0.5 (filler width / scribe), keep:<code>.
function brief(slots: CabinetFillSlot[], objects: ModelObject[] = []): string[] {
  return slots.map((s) => {
    if (s.kind === 'box') return s.code;
    if (s.kind === 'filler') return s.scribe > 0 ? `${s.code}/${s.scribe}` : s.code;
    const o = objects.find((x) => x.id === s.id);
    return `keep:${o?.type === 'cabinet_box' ? o.data.attributes.code : s.id}`;
  });
}

function fillEmpty(length: number, extra: ModelObject[] = []) {
  const r = run([]);
  const f = cabinetAutoFill(r, [wall(length), r, ...extra], 3);
  if (f === null) throw new Error('no fill');
  return f;
}

describe('EZD-408 Auto-fill run', () => {
  it('the line widths: B36 down to B9 in 3" steps', () => {
    expect(cabinetFillBoxWidths(cabinetFillLine(3))).toEqual([
      36, 33, 30, 27, 24, 21, 18, 15, 12, 9,
    ]);
  });

  it('fills from the left with the widest box that fits: 111 1/2" takes three B36', () => {
    expect(cabinetFillWidths(111.5, cabinetFillLine(3))).toEqual([36, 36, 36]);
    // 40": 36, then 4" left, under the smallest box.
    expect(cabinetFillWidths(40, cabinetFillLine(3))).toEqual([36]);
    // 8": no box fits.
    expect(cabinetFillWidths(8, cabinetFillLine(3))).toEqual([]);
  });

  it('AC-EZD-408-1: a 117 1/2" empty wall returns 3" boxes plus fillers, the total inside the scribe', () => {
    const f = fillEmpty(117.5);
    expect(brief(f.slots)).toEqual(['F3', 'B36', 'B36', 'B36', 'F6/0.5']);
    const boxes = f.slots.filter((s) => s.kind === 'box');
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b.width % 3).toBe(0);
    expect(f.slots.filter((s) => s.kind === 'filler').length).toBeGreaterThan(0);
    expect(f.total).toBe(117);
    expect(f.scribe).toBe(0.5);
    const fit = cabinetRunFit({ total: f.total, wallLength: 117.5, scribe: f.scribe, tolerance: null });
    expect(fit.fits).toBe(true);
    expect(fit.gap).toBe(0.5);
    expect(f.from).toBe(0);
    expect(f.to).toBe(117.5);
    expect(f.replaced).toEqual([]);
  });

  it('a 120" wall: three B36 and 12" left, so F3 and F9 with no scribe', () => {
    // 120 - 6 = 114: 36, 36, 36, 6 left. Fillers 3 + 9 = 12.
    const f = fillEmpty(120);
    expect(brief(f.slots)).toEqual(['F3', 'B36', 'B36', 'B36', 'F9']);
    expect(f.total).toBe(120);
    expect(f.scribe).toBe(0);
  });

  it('a 14" wall is too short for a box: F3 and F9 with 2" scribe', () => {
    // 14 - 6 = 8, under B9. Left over 14 - 3 = 11 at the far end: F3 + 6 = F9, 2" scribe.
    const f = fillEmpty(14);
    expect(brief(f.slots)).toEqual(['F3', 'F9/2']);
    expect(cabinetRunFit({ total: f.total, wallLength: 14, scribe: f.scribe, tolerance: null }).fits).toBe(
      true,
    );
  });

  it('a 5" wall, short of two fillers: one F3 with 2" scribe', () => {
    const f = fillEmpty(5);
    expect(brief(f.slots)).toEqual(['F3/2']);
  });

  it('keeps the board run\'s DW24 and SB36 where they stand and replaces the rest', () => {
    // Board S04: F3 0-3, B15 3-18, DW24 18-42, SB36 42-78, B18 78-96, B21 96-117 on 117 1/2".
    // 0-18 (wall to DW24): F3, then 15 left: B15. 42 (DW24 to SB36): nothing. 78-117 1/2 (SB36 to wall):
    // 39 1/2 - 3 = 36 1/2: B36, then 3 1/2 at the wall end: F3 with 1/2" scribe.
    const members = [
      filler(3, 0.5),
      box('B15', 15),
      box('DW24', 24, 'appliance_panel'),
      box('SB36', 36, 'sink_base'),
      box('B18', 18),
      box('B21', 21),
    ];
    const r = run(members);
    const f = cabinetAutoFill(r, [wall(117.5), r, ...members], 3);
    expect(f).not.toBeNull();
    expect(brief(f!.slots, members)).toEqual([
      'F3',
      'B15',
      'keep:DW24',
      'keep:SB36',
      'B36',
      'F3/0.5',
    ]);
    expect(f!.total).toBe(117);
    expect(f!.replaced).toEqual([members[0]!.id, members[1]!.id, members[4]!.id, members[5]!.id]);
  });

  it('a kept sink base off the grid gets a filler beside it to stay where it stands', () => {
    // A custom B40 then SB36 at 40-76. 0-40: F3, 37 left: B36, 1" filler beside the sink base.
    // 76-117 1/2: 41 1/2 - 3 = 38 1/2: B36, 5 1/2 at the wall end: F3 with 2 1/2" scribe. Total 115.
    const members = [box('B40', 40), box('SB36', 36, 'sink_base')];
    const r = run(members);
    const f = cabinetAutoFill(r, [wall(117.5), r, ...members], 3)!;
    expect(brief(f.slots, members)).toEqual(['F3', 'B36', 'F1', 'keep:SB36', 'B36', 'F3/2.5']);
    expect(f.total).toBe(115);
    expect(cabinetRunFit({ total: f.total, wallLength: 117.5, scribe: f.scribe, tolerance: null }).fits).toBe(
      true,
    );
  });

  it('a door stops the fill: 0 to 85 on a wall with a 30" door centred at 100', () => {
    // 85 - 6 = 79: 36, 36, 7 left. 85 - 72 - 3 = 10 at the end: F3 + 6 = F9, 1" scribe.
    const f = fillEmpty(117.5, [opening('door', 100, 30, 0)]);
    expect(f.from).toBe(0);
    expect(f.to).toBe(85);
    expect(brief(f.slots)).toEqual(['F3', 'B36', 'B36', 'F9/1']);
  });

  it('a window above the countertop does not stop the fill', () => {
    const f = fillEmpty(117.5, [opening('window', 60, 36, 42)]);
    expect(brief(f.slots)).toEqual(['F3', 'B36', 'B36', 'B36', 'F6/0.5']);
  });

  it('a range placed against the run face stops the fill; one in the room behind the wall does not', () => {
    const range = fillEmpty(117.5, [fixture('range', 100, 13, 30)]);
    expect(range.to).toBe(85);
    expect(brief(range.slots)).toEqual(['F3', 'B36', 'B36', 'F9/1']);
    const behind = fillEmpty(117.5, [fixture('range', 100, -17.5, 30)]);
    expect(behind.to).toBe(117.5);
    // A sink is not a floor-standing appliance: it sits in a sink base.
    expect(fillEmpty(117.5, [fixture('sink', 60, 13, 30)]).to).toBe(117.5);
  });

  it('the fill moves the run start to the stretch it fills', () => {
    // A door at 0-30 (centred 15): the stretch is 30 to 117 1/2 and the run now starts at x = 30.
    const f = fillEmpty(117.5, [opening('door', 15, 30, 0)]);
    expect(f.from).toBe(30);
    expect(f.start).toEqual({ x: 30, y: 0 });
  });

  it('a run off every wall has nothing to fill', () => {
    const r = run([]);
    const off: CabinetRun = {
      ...r,
      data: { ...r.data, geometry: { ...r.data.geometry, hostWallId: null } },
    };
    expect(cabinetAutoFill(off, [wall(117.5), off], 3)).toBeNull();
  });
});
