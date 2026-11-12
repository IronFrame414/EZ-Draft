// EZD-213a - T19-T25 (vault/plans/EZD-213a.md section 4; AC-EZD-213-8, -22, -23): what the inspector shows for a
// selection. Expected values: Q-0630 rows 5, 8; Q-0635; Q-0640 row 5-1; Q-0641 row 1; Q-0642 row 3; Q-0645 (a);
// 09j rows 15, 16; board W1, W5, W8-W10, W14, W15, S03dStates; P204a sizes and "Swing meaning"; plan Decided "Selection
// ids", "Sub-line rooms", "Side labels", "Hinge labels", "Offset", "Display text", "Mixed", "Bulk fields".
import { describe, expect, it } from 'vitest';
import { NO_NUMBERS } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Objects } from '../model/patches';
import { inspectorEditChanges, type InspectorEdit } from './inspector-edits';
import { inspectorView, type InspectorView } from './inspector-view';
import { F1, houseObjects, idSeq, loneObjects, uid } from './test-utils/fixtures';

const view = (objects: Objects, ids: readonly string[]): InspectorView =>
  inspectorView(objects, F1, ids);

// Applies one inspector edit to the objects (the edit must be accepted).
const after = (objects: Objects, ids: readonly string[], edit: InspectorEdit): Objects => {
  const r = inspectorEditChanges({
    objects,
    level: F1,
    ids,
    edit,
    newId: idSeq(900),
    highs: NO_NUMBERS,
  });
  if (!r.ok) throw new Error(`edit refused: ${r.reason} ${r.id}`);
  return applyEditTo(objects, makeEdit(objects, r.changes), 'forward');
};

function asWall(v: InspectorView): Extract<InspectorView, { kind: 'wall' }> {
  expect(v.kind).toBe('wall');
  if (v.kind !== 'wall') throw new Error(`not a wall view: ${v.kind}`);
  return v;
}
function asOpening(v: InspectorView): Extract<InspectorView, { kind: 'opening' }> {
  expect(v.kind).toBe('opening');
  if (v.kind !== 'opening') throw new Error(`not an opening view: ${v.kind}`);
  return v;
}
function asBulk(v: InspectorView): Extract<InspectorView, { kind: 'bulk' }> {
  expect(v.kind).toBe('bulk');
  if (v.kind !== 'bulk') throw new Error(`not a bulk view: ${v.kind}`);
  return v;
}

const DEFAULT_ROWS = [
  { material: 'drywall', thickness: '1/2"' },
  { material: 'stud', thickness: '3 1/2"' },
  { material: 'drywall', thickness: '1/2"' },
];

describe('EZD-213a inspector view', () => {
  it('EZD-213a T19 empty inspector', () => {
    for (const ids of [[], [uid(99)], [uid(20)], [F1]]) {
      expect(view(houseObjects(), ids), JSON.stringify(ids)).toEqual({ kind: 'empty' });
    }
  });

  it('EZD-213a T20 wall view', () => {
    const p = asWall(view(houseObjects(), [uid(5)]));
    expect(p.id).toBe(uid(5));
    expect(p.number).toBe(5);
    expect(p.rooms).toEqual(['Kitchen', 'Laundry']);
    expect(p.fields).toEqual({
      length: '10\' 0"',
      thickness: '4 1/2"',
      height: '8\' 0"',
      total: '4 1/2"',
      layers: DEFAULT_ROWS,
      status: 'existing',
      bearing: false,
    });

    expect(asWall(view(houseObjects(), [uid(1)])).rooms).toEqual(['Kitchen', 'Laundry']);

    const a = asWall(view(loneObjects({ x: 147.9375, y: 0 }), [uid(40)]));
    expect(a.fields.length).toBe('12\' 4"');
    expect(a.rooms).toEqual([]);
    const b = asWall(view(loneObjects({ x: 150.25, y: 0 }), [uid(40)]));
    expect(b.fields.length).toBe('12\' 6 1/2"');
    expect(b.rooms).toEqual([]);

    const layered = after(houseObjects(), [uid(5)], {
      field: 'wallLayer',
      index: 0,
      layer: { material: 'drywall', thickness: 0.625 },
    });
    const c = asWall(view(layered, [uid(5)]));
    expect(c.fields.total).toBe('4 5/8"');
    expect(c.fields.thickness).toBe('4 5/8"');
  });

  it('EZD-213a T21 exterior door view', () => {
    const d = asOpening(view(houseObjects(), [uid(30)]));
    expect(d.id).toBe(uid(30));
    expect(d.openingKind).toBe('door');
    expect(d.number).toBe(1);
    expect(d.rooms).toEqual(['Kitchen']);
    expect(d.host).toEqual({ number: 1 });
    expect(d.offset).toEqual({ left: '1\' 0"', cornerWall: { number: 4 } });
    expect(d.door).toEqual({
      swing: 'left',
      hand: 'left',
      swingLabels: { left: { kind: 'room', name: 'Kitchen' }, right: { kind: 'outside' } },
      hingeLabels: { left: 'left', right: 'right' },
      result: { opensInto: { kind: 'room', name: 'Kitchen' }, hinge: 'left' },
    });
    expect(d.fields).toEqual({
      width: '3\' 0"',
      height: '6\' 8"',
      roughOpening: { width: '3\' 2"', height: '6\' 10 1/2"' },
      roughOpeningAuto: true,
      sillHeight: null,
      impactRating: 'not_rated',
      shutterType: null,
    });

    const w = asOpening(view(houseObjects(), [uid(32)]));
    expect(w.openingKind).toBe('window');
    expect(w.fields.sillHeight).toBe('3\' 0"');
    expect(w.fields.roughOpening).toEqual({ width: '3\' 0 1/2"', height: '4\' 0 1/2"' });
    expect(w.door).toBeNull();
  });

  it('EZD-213a T22 interior door on a vertical partition', () => {
    const d = asOpening(view(houseObjects(), [uid(31)]));
    expect(d.rooms).toEqual(['Kitchen', 'Laundry']);
    expect(d.host).toEqual({ number: 5 });
    expect(d.door).not.toBeNull();
    expect(d.door!.hingeLabels).toEqual({ left: 'top', right: 'bottom' });
    expect(d.door!.swingLabels).toEqual({
      left: { kind: 'room', name: 'Kitchen' },
      right: { kind: 'room', name: 'Laundry' },
    });
    expect(d.door!.result).toEqual({ opensInto: { kind: 'room', name: 'Kitchen' }, hinge: 'top' });
    expect(d.offset).toEqual({ left: '3\' 6"', cornerWall: { number: 3 } });

    const flipped = after(houseObjects(), [uid(31)], { field: 'hand', value: 'right' });
    const e = asOpening(view(flipped, [uid(31)]));
    expect(e.door!.result.hinge).toBe('bottom');
  });

  it('EZD-213a T23 lone vertical and slanted walls', () => {
    const v = asOpening(view(loneObjects({ x: 0, y: 120 }), [uid(41)]));
    expect(v.door).not.toBeNull();
    expect(v.door!.hingeLabels).toEqual({ left: 'top', right: 'bottom' });
    expect(v.offset).toEqual({ left: '3\' 6"', cornerWall: null });
    expect(v.door!.swingLabels).toEqual({
      left: { kind: 'plan', direction: 'left' },
      right: { kind: 'plan', direction: 'right' },
    });
    expect(v.door!.result).toEqual({
      opensInto: { kind: 'plan', direction: 'left' },
      hinge: 'top',
    });
    expect(v.rooms).toEqual([]);
    expect(v.host).toEqual({ number: 9 });

    const s = asOpening(view(loneObjects({ x: 1, y: 120 }), [uid(41)]));
    expect(s.door!.hingeLabels).toEqual({ left: 'left', right: 'right' });
    expect(s.door!.swingLabels).toEqual({
      left: { kind: 'plan', direction: 'up' },
      right: { kind: 'plan', direction: 'down' },
    });
  });

  it('EZD-213a T24 bulk and Mixed', () => {
    const objects = after(houseObjects(), [uid(5)], { field: 'wallThickness', inches: 6.5 });

    const a = asBulk(view(objects, [uid(1), uid(5)]));
    expect(a.count).toBe(2);
    expect(a.noun).toBe('walls');
    expect(a.walls).toEqual({
      thickness: { mixed: true },
      height: { mixed: false, value: '8\' 0"' },
      layers: { mixed: true },
      bearing: { mixed: false, value: false },
    });
    expect(a.openings).toBeNull();

    const b = asBulk(view(objects, [uid(1), uid(2)]));
    expect(b.walls).not.toBeNull();
    expect(b.walls!.layers).toEqual({ mixed: false, value: DEFAULT_ROWS });
    expect(b.walls!.thickness).toEqual({ mixed: false, value: '4 1/2"' });

    const c = asBulk(view(objects, [uid(30), uid(31)]));
    expect(c.noun).toBe('doors');
    expect(c.openings).not.toBeNull();
    expect(c.openings!.width).toEqual({ mixed: false, value: '3\' 0"' });
    expect(c.openings!.height).toEqual({ mixed: false, value: '6\' 8"' });
    expect(c.openings!.roughOpening.mixed).toBe(false);
    expect(c.openings!.sillHeight).toBeNull();
    expect(c.walls).toBeNull();

    const d = asBulk(view(objects, [uid(30), uid(32)]));
    expect(d.noun).toBe('objects');
    expect(d.openings).not.toBeNull();
    expect(d.openings!.width).toEqual({ mixed: false, value: '3\' 0"' });
    expect(d.openings!.height).toEqual({ mixed: true });
    expect(d.openings!.roughOpening).toEqual({ mixed: true });
    expect(d.openings!.impactRating).toEqual({ mixed: false, value: 'not_rated' });
    expect(d.openings!.sillHeight).toBeNull();

    const e = asBulk(view(objects, [uid(1), uid(30)]));
    expect(e.noun).toBe('objects');
    expect(e.walls).toBeNull();
    expect(e.openings).toBeNull();

    const f = asWall(view(objects, [uid(1), uid(1)]));
    expect(f.id).toBe(uid(1));
  });

  it('EZD-213a T25 flagged and unnumbered', () => {
    const flaggedDoor = new Map(houseObjects());
    const v = flaggedDoor.get(uid(30))!;
    const data = v.data as { geometry: Record<string, unknown> };
    flaggedDoor.set(uid(30), {
      ...v,
      data: {
        ...v.data,
        geometry: {
          ...data.geometry,
          center: { x: 30, y: 0 },
          hostWallId: null,
          axis: { x: 1, y: 0 },
        },
      },
    } as ObjectValue);
    const d = asOpening(view(flaggedDoor, [uid(30)]));
    expect(d.host).toBeNull();
    expect(d.rooms).toEqual([]);
    expect(d.offset).toBeNull();
    expect(d.door).not.toBeNull();
    expect(d.door!.hingeLabels).toEqual({ left: 'left', right: 'right' });
    expect(d.door!.swingLabels).toEqual({
      left: { kind: 'plan', direction: 'up' },
      right: { kind: 'plan', direction: 'down' },
    });

    const unnumbered = new Map(houseObjects());
    const w = unnumbered.get(uid(1))!;
    const attributes = { ...(w.data.attributes as Record<string, unknown>) };
    delete attributes.number;
    unnumbered.set(uid(1), { ...w, data: { ...w.data, attributes } });
    expect(asWall(view(unnumbered, [uid(1)])).number).toBeNull();
  });
});
