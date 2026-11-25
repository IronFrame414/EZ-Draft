// EZD-602 (S06 Controls "Canvas drag device | Canvas | Moves device; live distances."; vault/build/assumptions.md
// EZD-602 device chips). Expected values worked by hand: roomWalls(144, 120) has its inside faces on x = 0, x = 144,
// y = 0 and y = 120 (thickness to the outside). A device at (30, 10) is 10" off the y = 0 face (foot (30, 0)) and 30"
// along it from the x = 0 face (foot (0, 10)); moved by (12, 5) it stands at (42, 15).
import { describe, expect, it } from 'vitest';
import type { ModelObject } from '../schema';
import { ID, LEVEL_1, roomWalls } from '../walls/test-utils/fixtures';
import { deviceChips } from './device-chips';
import { moveSelection } from './selection';

const DEV = '00000000-0000-4000-8000-000000000602';
const device = (x: number, y: number): ModelObject =>
  ({
    id: DEV,
    type: 'device',
    data: {
      geometry: { point: { x, y } },
      status: 'new',
      level: LEVEL_1,
      attributes: { kind: 'receptacle_duplex', protection: 'gfci' },
    },
  }) as ModelObject;

describe('EZD-602 device drag', () => {
  it('a device moves by the delta, its attributes kept', () => {
    const r = moveSelection([...roomWalls(144, 120), device(30, 10)], [DEV], { x: 12, y: 5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toEqual([device(42, 15)]);
  });

  it('live distances: off the nearest wall face, and along it to the crossing wall face', () => {
    const chips = deviceChips([...roomWalls(144, 120), device(30, 10)], DEV);
    expect(chips).toHaveLength(2);
    const [off, along] = chips;
    expect(off).toMatchObject({ side: 'left', neighborId: ID.W1, from: { x: 30, y: 10 } });
    expect(off!.distance).toBeCloseTo(10, 9);
    expect(off!.to.x).toBeCloseTo(30, 9);
    expect(off!.to.y).toBeCloseTo(0, 9);
    expect(along).toMatchObject({ side: 'right', neighborId: ID.W4 });
    expect(along!.distance).toBeCloseTo(30, 9);
    expect(along!.to.x).toBeCloseTo(0, 9);
    expect(along!.to.y).toBeCloseTo(10, 9);
  });

  it('no walls on the floor: no chips', () => {
    expect(deviceChips([device(30, 10)], DEV)).toEqual([]);
  });
});
