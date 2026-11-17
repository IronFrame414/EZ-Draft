// EZD-5604a C1, C2 (vault/plans/EZD-5604a.md section 4, Decided "D-Schema"; AC-EZD-5604-1, -6, -8; Q-0637 change
// format row; Q-0638 gap 15 (status not writable); Q-0640 row 7 (rough opening mode not writable)).
import { describe, expect, it } from 'vitest';
import { assistantChangeSchema } from './changes';

const WALL_ADD = {
  op: 'add',
  type: 'wall',
  ref: 'n1',
  start: { x: 0, y: 0 },
  end: { x: 120, y: 0 },
};
const DOOR_ADD = { op: 'add', type: 'door', ref: 'n2', hostWall: 'w2', center: { x: 60, y: 0 } };
const WINDOW_ADD = { ...DOOR_ADD, type: 'window', sillHeight: 40 };
const WALL_UPDATE = { op: 'update', type: 'wall', ref: 'w1', thickness: 6.5 };
const DOOR_UPDATE = { op: 'update', type: 'door', ref: 'o2', swing: 'right' };
const WINDOW_UPDATE = { op: 'update', type: 'window', ref: 'o1', width: 30 };
const removeOf = (type: string) => ({ op: 'remove', type, ref: 'o1' });

const ok = (v: unknown) => assistantChangeSchema.safeParse(v).success;

describe('EZD-5604a change format', () => {
  it('C1 accepts each op and type', () => {
    for (const c of [
      WALL_ADD,
      DOOR_ADD,
      WINDOW_ADD,
      WALL_UPDATE,
      DOOR_UPDATE,
      WINDOW_UPDATE,
      removeOf('wall'),
      removeOf('door'),
      removeOf('window'),
    ])
      expect(ok(c), JSON.stringify(c)).toBe(true);
  });

  it('C2 refuses bad changes', () => {
    const bad: [string, unknown][] = [
      ['extra key', { ...WALL_ADD, x: 1 }],
      ['status on an update', { ...WALL_UPDATE, status: 'new' }],
      ['number on a door add', { ...DOOR_ADD, number: 3 }],
      ['roughOpeningMode on a door update', { ...DOOR_UPDATE, roughOpeningMode: 'auto' }],
      ['thickness with layers', { ...WALL_UPDATE, layers: [{ material: 'stud', thickness: 3.5 }] }],
      ['op move', { ...WALL_UPDATE, op: 'move' }],
      ['type room', { ...WALL_UPDATE, type: 'room' }],
      ['update with no field', { op: 'update', type: 'wall', ref: 'w1' }],
      ['ref W1', { ...WALL_UPDATE, ref: 'W1' }],
      ['ref __proto__', { ...WALL_UPDATE, ref: '__proto__' }],
      ['ref of 17 letters', { ...WALL_UPDATE, ref: 'abcdefghijklmnopq' }],
      ['center x y z', { ...DOOR_ADD, center: { x: 1, y: 2, z: 3 } }],
      ['width as text', { ...WINDOW_UPDATE, width: '36' }],
      ['door add with no host', { op: 'add', type: 'door', ref: 'n2', center: { x: 60, y: 0 } }],
      ['hostWall on an update', { ...DOOR_UPDATE, hostWall: 'w2' }],
      ['width Infinity', { ...WINDOW_UPDATE, width: Infinity }],
      ['width NaN', { ...WINDOW_UPDATE, width: NaN }],
      [
        'a layer with an extra key',
        {
          op: 'update',
          type: 'wall',
          ref: 'w1',
          layers: [{ material: 'stud', thickness: 3.5, x: 1 }],
        },
      ],
    ];
    for (const [label, c] of bad) expect(ok(c), label).toBe(false);
  });
});
