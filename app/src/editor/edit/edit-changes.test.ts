// EZD-217 C1-C9 (vault/plans/EZD-217.md section 3 E1, section 4; Decided "copyItems", "clipCenter",
// "deleteChanges", "Bearing", "pasteChanges" (1)-(3); AC-EZD-217-1, -2, -3, -5, -6, -7, -10, -17).
import { roomAreaSqFt } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { clipCenter, copyItems, deleteChanges, pasteChanges } from './edit-changes';
import {
  DOOR,
  F1,
  ROOM,
  dataOf,
  highs,
  idSeq,
  p,
  uid,
  wallOnF2,
  withOpenings,
} from './test-utils/fixtures';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const changeFor = (changes: { id: string; value: ObjectValue | null }[], id: string) =>
  changes.filter((c) => c.id === id);

describe('EZD-217 edit changes', () => {
  it('EZD-217 C1 copyItems keeps walls and openings of the floor in order', () => {
    const objects = withOpenings(ROOM, 'door');
    objects.set(uid(60), wallOnF2());
    const items = copyItems(objects, F1, [uid(50), uid(1).toUpperCase(), uid(5), uid(99), uid(60)]);
    expect(items.map((i) => i.id)).toEqual([uid(50), uid(1)]);
    expect(items[0]!.value).toBe(objects.get(uid(50)));
    expect(items[1]!.value).toBe(objects.get(uid(1)));
  });

  it('EZD-217 C2 clipCenter', () => {
    const objects = withOpenings(ROOM, 'door');
    expect(clipCenter(copyItems(objects, F1, [uid(1), uid(50)]))).toEqual(p(72, 0));
    expect(clipCenter(copyItems(objects, F1, [uid(2)]))).toEqual(p(144, 60));
    expect(clipCenter([])).toBeNull();
  });

  it('EZD-217 C3 deleting one wall of the 12 by 10 room, then undo and redo', () => {
    const onCommit = vi.fn();
    const store = createModelStore({ objects: ROOM, onCommit });
    const changes = deleteChanges(ROOM, F1, [uid(1)], idSeq(70));
    expect(changes.map((c) => c.id)).toEqual([uid(1), uid(5)]);
    expect(changes.map((c) => c.value)).toEqual([null, null]);

    store.applyEdit(changes);
    expect(store.getState().objects.has(uid(1))).toBe(false);
    expect(store.getState().objects.has(uid(5))).toBe(false);

    store.undo();
    const back = store.getState().objects;
    expect(back.get(uid(1))).toEqual(ROOM.get(uid(1)));
    expect(back.get(uid(5))).toEqual(ROOM.get(uid(5)));
    const room = dataOf(back.get(uid(5))) as unknown as {
      geometry: { boundary: { x: number; y: number }[] };
    };
    expect(roomAreaSqFt(room.geometry.boundary)).toBe(120);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit.mock.calls[1]![0].map((c: { id: string }) => c.id)).toEqual([uid(1), uid(5)]);

    store.redo();
    expect(store.getState().objects.has(uid(1))).toBe(false);
    expect(store.getState().objects.has(uid(5))).toBe(false);
  });

  it('EZD-217 C4 a deleted host leaves the door flagged; a bearing wall deletes', () => {
    const objects = withOpenings(ROOM, 'door');
    const a = changeFor(deleteChanges(objects, F1, [uid(1)], idSeq(70)), uid(50));
    expect(a).toHaveLength(1);
    const g = dataOf(a[0]!.value).geometry;
    expect(g.hostWallId).toBeNull();
    expect(g.axis).toEqual(p(1, 0));
    expect(g.center).toEqual(p(72, 0));

    const b = changeFor(deleteChanges(objects, F1, [uid(1), uid(50)], idSeq(70)), uid(50));
    expect(b).toHaveLength(1);
    expect(b[0]!.value).toBeNull();

    const w2 = ROOM.get(uid(2))!;
    const bearing = new Map(ROOM).set(uid(2), {
      ...w2,
      data: {
        ...w2.data,
        attributes: { ...(w2.data as { attributes: object }).attributes, bearing: true },
      },
    });
    const c = changeFor(deleteChanges(bearing, F1, [uid(2)], idSeq(70)), uid(2));
    expect(c).toHaveLength(1);
    expect(c[0]!.value).toBeNull();
  });

  it('EZD-217 C5 delete ignores rooms, unknown ids and other floors', () => {
    const objects = new Map(ROOM).set(uid(60), wallOnF2());
    for (const ids of [[uid(5)], [uid(99)], [uid(60)], []]) {
      expect(deleteChanges(objects, F1, ids, idSeq(70))).toEqual([]);
    }
  });

  it('EZD-217 C6 a pasted wall gets a new id, number and spot', () => {
    const w1 = ROOM.get(uid(1))!;
    const source = {
      ...w1,
      data: { ...w1.data, level: '22222222-2222-4222-8222-222222222222', status: 'demo' },
    };
    const out = pasteChanges(
      ROOM,
      F1,
      [{ id: uid(1), value: source }],
      p(72, -96),
      idSeq(100),
      highs,
    );
    expect(out.ids).toEqual([uid(100)]);
    const d = dataOf(changeFor(out.changes, uid(100))[0]!.value);
    expect(d.geometry.start).toEqual(p(0, -96));
    expect(d.geometry.end).toEqual(p(144, -96));
    expect(d.level).toBe(F1);
    expect(d.status).toBe('demo');
    expect(d.attributes.number).toBe(5);
    expect(changeFor(out.changes, uid(1))).toEqual([]);
  });

  it('EZD-217 C7 a door pasted with its wall goes on the copy', () => {
    const objects = withOpenings(ROOM, 'door', 'window');
    const clip = copyItems(objects, F1, [uid(1), uid(50), uid(51)]);
    expect(clipCenter(clip)).toEqual(p(72, 30));
    const out = pasteChanges(objects, F1, clip, p(72, -66), idSeq(100), highs);
    expect(out.ids).toEqual([uid(100), uid(101), uid(102)]);
    const wall = dataOf(changeFor(out.changes, uid(100))[0]!.value);
    expect(wall.geometry.start).toEqual(p(0, -96));
    expect(wall.geometry.end).toEqual(p(144, -96));
    expect(wall.attributes.number).toBe(5);
    const door = dataOf(changeFor(out.changes, uid(101))[0]!.value);
    expect(door.geometry.hostWallId).toBe(uid(100));
    expect(door.geometry.axis).toBeNull();
    expect(door.geometry.center).toEqual(p(72, -96));
    expect(door.attributes.number).toBe(2);
    const win = dataOf(changeFor(out.changes, uid(102))[0]!.value);
    expect(win.geometry.center).toEqual(p(144, -36));
    expect(win.geometry.hostWallId).toBeNull();
    expect(win.geometry.axis).toEqual(p(0, 1));
    expect(win.attributes.number).toBe(2);
  });

  it('EZD-217 C8 a door pasted alone: the on-wall test decides', () => {
    const objects = withOpenings(ROOM, 'door');
    const clip = copyItems(objects, F1, [uid(50)]);
    const sourceSwing = dataOf(DOOR).attributes.swing;

    const a = pasteChanges(objects, F1, clip, p(72, 300), idSeq(100), highs);
    const ad = dataOf(changeFor(a.changes, uid(100))[0]!.value);
    expect(ad.geometry.hostWallId).toBeNull();
    expect(ad.geometry.axis).toEqual(p(1, 0));

    const b = pasteChanges(objects, F1, clip, p(72, 120), idSeq(100), highs);
    const bd = dataOf(changeFor(b.changes, uid(100))[0]!.value);
    expect(bd.geometry.hostWallId).toBe(uid(3));
    expect(bd.geometry.axis).toBeNull();
    expect(bd.attributes.swing).toBe(sourceSwing === 'left' ? 'right' : 'left');

    const c = pasteChanges(objects, F1, clip, p(72, 0), idSeq(100), highs);
    const cd = dataOf(changeFor(c.changes, uid(100))[0]!.value);
    expect(cd.geometry.hostWallId).toBeNull();
  });

  it('EZD-217 C9 four pasted walls make a room; empty input pastes nothing', () => {
    const clip = copyItems(ROOM, F1, [uid(1), uid(2), uid(3), uid(4)]);
    expect(clipCenter(clip)).toEqual(p(72, 60));
    const out = pasteChanges(ROOM, F1, clip, p(372, 60), idSeq(100), highs);
    expect(out.changes).toHaveLength(5);
    expect(out.changes.map((c) => c.id)).toEqual([
      uid(100),
      uid(101),
      uid(102),
      uid(103),
      uid(104),
    ]);
    const room = out.changes[4]!.value as unknown as {
      type: string;
      data: { geometry: { boundary: { x: number; y: number }[] } };
    };
    expect(room.type).toBe('room');
    expect(roomAreaSqFt(room.data.geometry.boundary)).toBe(120);
    expect(changeFor(out.changes, uid(5))).toEqual([]);
    expect(near(dataOf(out.changes[0]!.value).geometry.start.x, 300)).toBe(true);

    expect(pasteChanges(ROOM, F1, [], p(372, 60), idSeq(100), highs)).toEqual({
      changes: [],
      ids: [],
    });
    expect(pasteChanges(ROOM, F1, clip, p(Number.NaN, 0), idSeq(100), highs)).toEqual({
      changes: [],
      ids: [],
    });
  });
});
