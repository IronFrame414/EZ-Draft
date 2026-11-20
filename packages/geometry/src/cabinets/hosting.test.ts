// EZD-410 (AC-EZD-410-1 "A wall move that strands a cabinet flags it red"; S04 Validation "Hosted cabinet left off a
// wall after a wall move: red 'Not on a wall' flag"). The run is board S04's back wall run (3 + 15 + 24 + 36 + 18 + 21
// = 117" base, 15 + 30 = 45" uppers) from (0,0) along +x on a 117 1/2" wall, 4 1/2" thick to its right, so its left
// face is the wall's line (y = 0) and its right face is y = -4 1/2. Expected states are worked by hand from those
// numbers and the moves typed below.
import { describe, expect, it } from 'vitest';
import type { ModelObject } from '../schema';
import { createWallData } from '../walls/wall';
import { moveWall } from '../walls/move';
import { cabinetRunHostProblem, isCabinetRunOffWall } from './hosting';
import type { CabinetRun } from './run';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const OTHER_LEVEL = '44234c39-7f4e-4f09-8b77-92e9c457f84b';
const WALL = 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45';
let n = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function wall(
  start = { x: 0, y: 0 },
  end = { x: 117.5, y: 0 },
  side: 'left' | 'right' | 'center' = 'right',
  id = WALL,
): ModelObject {
  const made = createWallData({ start, end, level: LEVEL, thicknessSide: side });
  if (!made.ok) throw new Error('wall');
  return {
    id,
    type: 'wall',
    data: { ...made.data, attributes: { ...made.data.attributes, thickness: 4.5 } },
  };
}

const box = (code: string, width: number, upper = false): ModelObject => ({
  id: nextId(),
  type: 'cabinet_box',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code,
      boxType: upper ? 'wall' : 'base',
      width,
      depth: upper ? 12 : 24,
      height: upper ? 30 : 34.5,
      faceLayout: 'door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});

function boardRun(
  geometry: Partial<CabinetRun['data']['geometry']> = {},
  withMembers = true,
): ModelObject[] {
  const base = withMembers
    ? [
        box('F3', 3),
        box('B15', 15),
        box('DW24', 24),
        box('SB36', 36),
        box('B18', 18),
        box('B21', 21),
      ]
    : [];
  const upper = withMembers ? [box('W1530', 15, true), box('W3030', 30, true)] : [];
  const run: CabinetRun = {
    id: nextId(),
    type: 'cabinet_run',
    data: {
      geometry: { hostWallId: WALL, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, ...geometry },
      level: LEVEL,
      attributes: {
        name: 'Back wall run',
        base: base.map((o) => o.id),
        upper: upper.map((o) => o.id),
      },
    },
  };
  return [run, ...base, ...upper];
}

const runOf = (objects: readonly ModelObject[]) =>
  objects.find((o): o is CabinetRun => o.type === 'cabinet_run')!;

// The model after moving the host wall by `delta` (walls/move.ts; hosted items stay where they stand).
function afterMove(objects: ModelObject[], delta: { x: number; y: number }): ModelObject[] {
  const r = moveWall(objects, WALL, delta);
  if (!r.ok) throw new Error(r.reason);
  const changed = new Map<string, ModelObject>(r.changed.map((w) => [w.id, w]));
  return objects.map((o) => changed.get(o.id) ?? o);
}

describe('EZD-410 cabinet run on its wall', () => {
  it('the board run stands on its wall before any move', () => {
    const model = [wall(), ...boardRun()];
    expect(cabinetRunHostProblem(runOf(model), model)).toBeNull();
    expect(isCabinetRunOffWall(runOf(model), model)).toBe(false);
  });

  it('AC-EZD-410-1 moving the wall 6" off the run strands it: Not on a wall', () => {
    const model = afterMove([wall(), ...boardRun()], { x: 0, y: 6 });
    expect(cabinetRunHostProblem(runOf(model), model)).toBe('off_wall');
    expect(isCabinetRunOffWall(runOf(model), model)).toBe(true);
  });

  it('moving the wall back to where it was clears the flag', () => {
    const moved = afterMove([wall(), ...boardRun()], { x: 0, y: 6 });
    const back = afterMove(moved, { x: 0, y: -6 });
    expect(isCabinetRunOffWall(runOf(back), back)).toBe(false);
  });

  it('a move by less than the wall thickness still strands it (1" off the face)', () => {
    const model = afterMove([wall(), ...boardRun()], { x: 0, y: -1 });
    expect(cabinetRunHostProblem(runOf(model), model)).toBe('off_wall');
  });

  it('a slide along its own line that still shares length with the run keeps it on the wall', () => {
    // Wall 24 .. 141 1/2 against the run 0 .. 117: they share 93".
    const model = afterMove([wall(), ...boardRun()], { x: 24, y: 0 });
    expect(cabinetRunHostProblem(runOf(model), model)).toBeNull();
  });

  it('a slide along its line clear of the run strands it', () => {
    // Wall 200 .. 317 1/2 against the run 0 .. 117: nothing shared.
    const model = afterMove([wall(), ...boardRun()], { x: 200, y: 0 });
    expect(cabinetRunHostProblem(runOf(model), model)).toBe('off_wall');
  });

  it('a run longer than its wall is a fit mismatch, not off the wall', () => {
    const model = [wall({ x: 0, y: 0 }, { x: 60, y: 0 }), ...boardRun()];
    expect(cabinetRunHostProblem(runOf(model), model)).toBeNull();
  });

  it('a run on the wall right face (y = -4 1/2) stands on it', () => {
    const model = [wall(), ...boardRun({ start: { x: 0, y: -4.5 } })];
    expect(cabinetRunHostProblem(runOf(model), model)).toBeNull();
  });

  it('a wall drawn the other way with its thickness to the left still hosts the run', () => {
    const model = [wall({ x: 117.5, y: 0 }, { x: 0, y: 0 }, 'left'), ...boardRun()];
    expect(cabinetRunHostProblem(runOf(model), model)).toBeNull();
  });

  it('a run across the wall rather than along it is off the wall', () => {
    const model = [wall(), ...boardRun({ axis: { x: 0, y: 1 } })];
    expect(cabinetRunHostProblem(runOf(model), model)).toBe('off_wall');
  });

  it('an empty run is on the wall when its start is on it', () => {
    const on = [wall(), ...boardRun({ start: { x: 40, y: 0 } }, false)];
    expect(cabinetRunHostProblem(runOf(on), on)).toBeNull();
    const off = [wall(), ...boardRun({ start: { x: 130, y: 0 } }, false)];
    expect(cabinetRunHostProblem(runOf(off), off)).toBe('off_wall');
  });

  it('a deleted host wall and a host on another floor are flagged', () => {
    const gone = boardRun();
    expect(cabinetRunHostProblem(runOf(gone), gone)).toBe('host_not_found');
    const w = wall();
    const elsewhere = [
      { ...w, data: { ...w.data, level: OTHER_LEVEL } } as ModelObject,
      ...boardRun(),
    ];
    expect(cabinetRunHostProblem(runOf(elsewhere), elsewhere)).toBe('host_not_found');
  });

  it('a freestanding run with no host (an island) is not flagged', () => {
    const none = [wall(), ...boardRun({ hostWallId: null })];
    expect(cabinetRunHostProblem(runOf(none), none)).toBeNull();
    expect(isCabinetRunOffWall(runOf(none), none)).toBe(false);
  });
});
