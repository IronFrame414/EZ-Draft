// EZD-218 AC-EZD-218-4: the Rooms list and one room field edit. Expected values from the spec, never the code: S03
// Controls — left panel "Room list with area", "Shows name and sf"; 09j Room area (whole square feet, halves up:
// 144" × 120" = 120 sf; 150" × 158.4" = 23,760 sq in = 165 sf); 03 Q-0664 room types Kitchen, Bath, Laundry, Other,
// free-text floor finish, ceiling flat, single slope, vaulted/cathedral, tray, coffered; a room's name may not be
// blank (roomDataSchema). Real model store: each edit is one undo step.
import { parseStoredObject, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { baseObjects, F1, F2, roomValue, uid } from '../tools/test-utils/fixtures';
import { roomAttributeChange, roomRows } from './rooms';

const pt = (x: number, y: number): Point => ({ x, y });
const rect = (x: number, y: number, w: number, h: number) => [
  pt(x, y),
  pt(x + w, y),
  pt(x + w, y + h),
  pt(x, y + h),
];

function objects() {
  const o = baseObjects();
  o.set(uid(1), roomValue(rect(0, 0, 150, 158.4), 'Kitchen', null));
  o.set(uid(2), roomValue(rect(150, 0, 144, 120), 'Laundry', null));
  o.set(uid(3), roomValue(rect(0, 0, 144, 120), 'Upstairs', null, F2));
  return o;
}

const attrsOf = (o: Objects, id: string) =>
  (o.get(id)!.data as { attributes: Record<string, unknown> }).attributes;

describe('EZD-218 rooms list', () => {
  it('AC-4 the open floor’s rooms in stored order with name and whole square feet', () => {
    const rows = roomRows(objects(), F1);
    expect(rows.map((r) => [r.id, r.name, r.areaSqFt])).toEqual([
      [uid(1), 'Kitchen', 165],
      [uid(2), 'Laundry', 120],
    ]);
    expect(rows[0]).toMatchObject({
      status: 'existing',
      roomType: null,
      floorFinish: '',
      ceilingType: null,
    });
    expect(roomRows(objects(), null)).toEqual([]);
  });
});

describe('EZD-218 room edits', () => {
  it('AC-4 each field is one change, one undo step, and the saved room parses', () => {
    const store = createModelStore({ objects: objects() });
    const apply = (field: Parameters<typeof roomAttributeChange>[2], value: string | null) => {
      const c = roomAttributeChange(store.getState().objects, uid(1), field, value);
      expect(c, field).not.toBeNull();
      store.applyEdit([c!]);
    };
    apply('roomType', 'bath');
    apply('name', '  Hall bath ');
    apply('floorFinish', ' Porcelain tile ');
    apply('ceilingType', 'vaulted');
    const a = attrsOf(store.getState().objects, uid(1));
    expect(a).toMatchObject({
      name: 'Hall bath',
      roomType: 'bath',
      floorFinish: 'Porcelain tile',
      ceilingType: 'vaulted',
    });
    expect(store.getState().past).toHaveLength(4);
    const v = store.getState().objects.get(uid(1))!;
    expect(
      parseStoredObject({ id: uid(1), type: v.type, schema_version: v.schemaVersion, data: v.data })
        .ok,
    ).toBe(true);
    store.undo();
    expect(attrsOf(store.getState().objects, uid(1)).ceilingType).toBeNull();
    apply('roomType', null);
    expect(attrsOf(store.getState().objects, uid(1)).roomType).toBeNull();
  });

  it('AC-4 a blank name, an unknown room, an unknown type and no change are refused', () => {
    const o = objects();
    expect(roomAttributeChange(o, uid(1), 'name', '   ')).toBeNull();
    expect(roomAttributeChange(o, uid(99), 'name', 'Den')).toBeNull();
    expect(roomAttributeChange(o, uid(1), 'roomType', 'garage')).toBeNull();
    expect(roomAttributeChange(o, uid(1), 'ceilingType', 'cathedral')).toBeNull();
    expect(roomAttributeChange(o, uid(1), 'name', 'Kitchen')).toBeNull();
    expect(roomAttributeChange(o, uid(1), 'roomType', null)).toBeNull();
  });

  it('a room id in another case still finds its room', () => {
    const c = roomAttributeChange(objects(), uid(2).toUpperCase(), 'roomType', 'laundry');
    expect(c?.id).toBe(uid(2));
  });
});
