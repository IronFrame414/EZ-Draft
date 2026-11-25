// EZD-1001a: the wall face and its place in the model. Expected values are worked by hand from the inputs: a 120"
// wall (the default 4.5" thick, 96" high: walls/wall.ts DEFAULT_WALL_LAYERS, DEFAULT_WALL_HEIGHT_IN), a 36 x 80
// door (DEFAULT_DOOR_SIZE) and a 36 x 48 window at a 36" sill (DEFAULT_WINDOW_SIZE, DEFAULT_WINDOW_SILL_IN).
import { describe, expect, it } from 'vitest';
import { createOpeningData } from '../openings/opening';
import { createWallData } from '../walls/wall';
import { wallFace, wallSolid } from './wall-face';

const LEVEL = '00000000-0000-4000-8000-000000000001';
const WALL_ID = '00000000-0000-4000-8000-000000000002';

function wall(start = { x: 0, y: 0 }, end = { x: 120, y: 0 }, side: 'left' | 'right' | 'center' = 'right') {
  const made = createWallData({ start, end, level: LEVEL, thicknessSide: side });
  if (!made.ok) throw new Error('wall');
  return { id: WALL_ID, type: 'wall' as const, data: made.data };
}

describe('EZD-1001a wallFace', () => {
  it('a plain wall is its rectangle', () => {
    expect(wallFace({ length: 120, height: 96, openings: [] })).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [120, 0],
        [120, 96],
        [0, 96],
      ],
      holes: [],
    });
  });

  it('a door is a notch in the outline and a window is a hole', () => {
    // Door 36 wide from x 12 to 48, 80 high; window from x 72 to 108, y 36 to 84.
    const face = wallFace({
      length: 120,
      height: 96,
      openings: [
        { offset: 72, width: 36, sill: 36, height: 48 },
        { offset: 12, width: 36, sill: 0, height: 80 },
      ],
    });
    expect(face).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [12, 0],
        [12, 80],
        [48, 80],
        [48, 0],
        [120, 0],
        [120, 96],
        [0, 96],
      ],
      holes: [
        [
          [72, 36],
          [108, 36],
          [108, 84],
          [72, 84],
        ],
      ],
    });
  });

  it('a door taller than its wall (Q-0630) is clipped to the wall and the face splits into solid rectangles', () => {
    // Door x 42 to 78 clipped to y 0..96: solid left of it (0..42) and right of it (78..120), nothing above.
    expect(wallFace({ length: 120, height: 96, openings: [{ offset: 42, width: 36, sill: 0, height: 100 }] })).toEqual({
      kind: 'rects',
      rects: [
        { x0: 0, y0: 0, x1: 42, y1: 96 },
        { x0: 78, y0: 0, x1: 120, y1: 96 },
      ],
    });
  });

  it('an opening over a wall end is clipped to the face', () => {
    // Window x -6 to 30 clipped to 0..30, y 36 to 84: below and above it from 0 to 30, then the solid 30..120.
    expect(wallFace({ length: 120, height: 96, openings: [{ offset: -6, width: 36, sill: 36, height: 48 }] })).toEqual({
      kind: 'rects',
      rects: [
        { x0: 0, y0: 0, x1: 30, y1: 36 },
        { x0: 0, y0: 84, x1: 30, y1: 96 },
        { x0: 30, y0: 0, x1: 120, y1: 96 },
      ],
    });
  });

  it('overlapping openings leave one solid span per strip', () => {
    // Windows x 20..56 (y 36..84) and x 40..76 (y 60..90): strips 0-20, 20-40, 40-56, 56-76, 76-120.
    expect(
      wallFace({
        length: 120,
        height: 96,
        openings: [
          { offset: 20, width: 36, sill: 36, height: 48 },
          { offset: 40, width: 36, sill: 60, height: 30 },
        ],
      }),
    ).toEqual({
      kind: 'rects',
      rects: [
        { x0: 0, y0: 0, x1: 20, y1: 96 },
        { x0: 20, y0: 0, x1: 40, y1: 36 },
        { x0: 20, y0: 84, x1: 40, y1: 96 },
        { x0: 40, y0: 0, x1: 56, y1: 36 },
        { x0: 40, y0: 90, x1: 56, y1: 96 },
        { x0: 56, y0: 0, x1: 76, y1: 60 },
        { x0: 56, y0: 90, x1: 76, y1: 96 },
        { x0: 76, y0: 0, x1: 120, y1: 96 },
      ],
    });
  });

  it('an opening wholly off the wall cuts nothing', () => {
    expect(wallFace({ length: 120, height: 96, openings: [{ offset: 130, width: 36, sill: 0, height: 80 }] }).kind).toBe(
      'outline',
    );
  });
});

describe('EZD-1001a wallSolid', () => {
  it('a wall drawn east with its thickness on the right starts at its line and goes south through 4.5"', () => {
    const w = wall();
    const door = { data: createOpeningData({ kind: 'door', center: { x: 60, y: 0 }, host: w }) };
    const s = wallSolid(w, [door]);
    expect(s).not.toBeNull();
    expect(s!.origin).toEqual({ x: 0, y: 0 });
    expect(s!.along).toEqual({ x: 1, y: 0 });
    expect(s!.through.x).toBeCloseTo(0, 12);
    expect(s!.through.y).toBe(-1);
    expect(s!.thickness).toBe(4.5);
    expect(s!.length).toBe(120);
    expect(s!.height).toBe(96);
    // Door centred at 60: x 42 to 78, 80 high.
    expect(s!.face).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [42, 0],
        [42, 80],
        [78, 80],
        [78, 0],
        [120, 0],
        [120, 96],
        [0, 96],
      ],
      holes: [],
    });
  });

  it('a centred wall drawn north has its left face 2.25" west of its line', () => {
    // Drawn north, the left normal is (-1, 0); a centred 4.5" wall has its left face 2.25" west of the line.
    const s = wallSolid(wall({ x: 10, y: 0 }, { x: 10, y: 60 }, 'center'), []);
    expect(s!.origin.x).toBeCloseTo(7.75, 12);
    expect(s!.origin.y).toBeCloseTo(0, 12);
    expect(s!.through.x).toBe(1);
    expect(s!.length).toBe(60);
  });
});

// EZD-504 (S05 States "walls under a slope get their top edge cut to match ... in 3D"): a 144" wall under a 4:12
// single slope, its top rising from 96" at its start to 144" at its end (4" per 12" over 144": ceiling/wall-top.ts),
// so the top is 96 + x / 3 at x.
describe('EZD-504 wallFace under a sloped top', () => {
  const top = [
    [0, 96],
    [144, 144],
  ] as const;

  it('a plain wall under a slope is its rectangle cut along the slope', () => {
    expect(wallFace({ length: 144, height: 144, openings: [], top: [...top] })).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [144, 0],
        [144, 144],
        [0, 96],
      ],
      holes: [],
    });
  });

  it('a window below the slope stays a hole', () => {
    // Window x 54 to 90, y 36 to 84; the top over it is 114" at its lowest.
    const face = wallFace({
      length: 144,
      height: 144,
      openings: [{ offset: 54, width: 36, sill: 36, height: 48 }],
      top: [...top],
    });
    expect(face).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [144, 0],
        [144, 144],
        [0, 96],
      ],
      holes: [
        [
          [54, 36],
          [90, 36],
          [90, 84],
          [54, 84],
        ],
      ],
    });
  });

  it('a window at the wall end falls to solid pieces whose tops follow the slope', () => {
    // Window x 0 to 36, y 36 to 84. Strip 0 to 36: below the window, and from 84 up to the top (96 at 0, 108 at 36).
    // Strip 36 to 144: floor to the top (108 at 36, 144 at 144).
    expect(
      wallFace({
        length: 144,
        height: 144,
        openings: [{ offset: 0, width: 36, sill: 36, height: 48 }],
        top: [...top],
      }),
    ).toEqual({
      kind: 'pieces',
      pieces: [
        [
          [0, 0],
          [36, 0],
          [36, 36],
          [0, 36],
        ],
        [
          [0, 84],
          [36, 84],
          [36, 108],
          [0, 96],
        ],
        [
          [36, 0],
          [144, 0],
          [144, 144],
          [36, 108],
        ],
      ],
    });
  });

  it('an opening taller than the slope over it is cut to the lowest top over its width', () => {
    // A door x 0 to 36, 120 high: the top over it is 96 at its lowest, so the door is cut to 96 there.
    const face = wallFace({
      length: 144,
      height: 144,
      openings: [{ offset: 0, width: 36, sill: 0, height: 120 }],
      top: [...top],
    });
    expect(face.kind).toBe('pieces');
    if (face.kind !== 'pieces') return;
    expect(face.pieces[0]).toEqual([
      [0, 96],
      [36, 96],
      [36, 108],
      [0, 96],
    ]);
  });

  it('wallSolid takes the top and is as high as its highest point', () => {
    const s = wallSolid(wall({ x: 0, y: 0 }, { x: 144, y: 0 }), [], [...top]);
    expect(s!.height).toBe(144);
    expect(s!.face).toEqual({
      kind: 'outline',
      outer: [
        [0, 0],
        [144, 0],
        [144, 144],
        [0, 96],
      ],
      holes: [],
    });
  });
});
