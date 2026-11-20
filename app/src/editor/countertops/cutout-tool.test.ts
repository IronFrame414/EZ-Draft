// EZD-413 (S04b Controls "Cutout | Place a sink or cooktop cutout; link to the fixture/appliance cutout size from
// catalog"; phase-04 EZD-413 "a typed W × D (default from the fixture under them)"; AC-EZD-413-2 "a typed 30" × 16"
// cutout draws at that size"; vault/build/assumptions.md EZD-413). On the EZD-412 two-run L kitchen, Trace makes A
// (x 0 to 144, y 0 to 25 1/2). A click at (60, 12) is 12" from the back side and 13 1/2" from the front, so the
// cutout's width runs along x: a 30 x 16 cutout there spans x 45 to 75 and y 4 to 20.
import { countertopPieceAreaSqIn, cutoutCorners, parseStoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import {
  countertopCutoutAt,
  countertopCutoutChanges,
  countertopCutoutSizeChanges,
} from './cutout-tool';
import { countertopPieces, countertopTraceChanges, countertopTraceDefaults } from './trace-tool';
import { CT_FLOOR, ctId as id, fixtureValue, twoRunModel } from './test-fixture';

const counter = (start: number) => {
  let n = start;
  return () => id(n++);
};

function traced(extra: [string, ObjectValue][] = []) {
  const model = new Map(twoRunModel());
  for (const [k, v] of extra) model.set(k, v);
  const store = createModelStore({ objects: model });
  const r = countertopTraceChanges(
    modelObjects(store.getState().objects),
    CT_FLOOR,
    countertopTraceDefaults(null),
    counter(100),
  );
  store.applyEdit(r.changes);
  return store;
}
const pieceA = (store: ReturnType<typeof createModelStore>) =>
  countertopPieces(modelObjects(store.getState().objects), CT_FLOOR).find((p) => p.id === id(100))!;
const SINK = { kind: 'sink' as const, width: 30, depth: 16 };

describe('EZD-413 Cutout tool', () => {
  it('AC-EZD-413-2: a typed 30" x 16" sink cutout is placed at that size, one undo step', () => {
    const store = traced();
    const areaBefore = countertopPieceAreaSqIn(pieceA(store).data);
    const r = countertopCutoutChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 60, y: 12 },
      SINK,
      counter(200),
    );
    expect(r.pieceId).toBe(id(100));
    expect(r.cutoutId).toBe(id(200));
    expect(store.applyEdit(r.changes)).toHaveLength(1);
    const a = pieceA(store);
    expect(a.data.attributes.cutouts).toEqual([
      {
        id: id(200),
        kind: 'sink',
        center: { x: 60, y: 12 },
        axis: { x: 1, y: 0 },
        width: 30,
        depth: 16,
        fixtureId: null,
      },
    ]);
    expect(cutoutCorners(a.data.attributes.cutouts![0]!)).toEqual([
      { x: 45, y: 4 },
      { x: 75, y: 4 },
      { x: 75, y: 20 },
      { x: 45, y: 20 },
    ]);
    expect(countertopPieceAreaSqIn(a.data)).toBeCloseTo(areaBefore, 9);
    const v = store.getState().objects.get(a.id)!;
    expect(parseStoredObject({ id: a.id, type: v.type, schema_version: v.schemaVersion, data: v.data }).ok).toBe(
      true,
    );
    expect(countertopCutoutAt([a], { x: 46, y: 19 })?.cutout.id).toBe(id(200));
    expect(countertopCutoutAt([a], { x: 44, y: 19 })).toBeNull();

    store.undo();
    expect(pieceA(store).data.attributes.cutouts).toBeUndefined();
  });

  it('typing 30 x 16 on a placed cutout resizes it about its center', () => {
    const store = traced();
    const r = countertopCutoutChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 60, y: 12 },
      { kind: 'cooktop', width: 30, depth: 21 },
      counter(200),
    );
    store.applyEdit(r.changes);
    const objects = modelObjects(store.getState().objects);
    store.applyEdit(countertopCutoutSizeChanges(objects, id(100), id(200), 30, 16));
    const c = pieceA(store).data.attributes.cutouts![0]!;
    expect([c.kind, c.width, c.depth, c.center]).toEqual(['cooktop', 30, 16, { x: 60, y: 12 }]);
    // 26" deep does not fit a 25 1/2" top.
    expect(countertopCutoutSizeChanges(objects, id(100), id(200), 30, 26)).toEqual([]);
  });

  it('over a sink its size, center and kind are the default, linked to the sink', () => {
    const store = traced([[id(50), fixtureValue('sink', { x: 90, y: 12 }, 33, 22)]]);
    const r = countertopCutoutChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 95, y: 15 },
      { kind: 'cooktop', width: 30, depth: 21 },
      counter(200),
    );
    store.applyEdit(r.changes);
    expect(pieceA(store).data.attributes.cutouts).toEqual([
      {
        id: id(200),
        kind: 'sink',
        center: { x: 90, y: 12 },
        axis: { x: 1, y: 0 },
        width: 33,
        depth: 22,
        fixtureId: id(50),
      },
    ]);
  });

  it('on a bare top the center lands on the 1/2" increment grid', () => {
    const store = traced();
    const r = countertopCutoutChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 60.2, y: 11.9 },
      SINK,
      counter(200),
      0.5,
    );
    expect(r.cutout?.center).toEqual({ x: 60, y: 12 });
  });

  it('a click off every piece, or a cutout past the edge of the top, makes no change', () => {
    const store = traced();
    const objects = modelObjects(store.getState().objects);
    expect(countertopCutoutChanges(objects, CT_FLOOR, { x: 100, y: 80 }, SINK, counter(200)).changes).toEqual([]);
    expect(countertopCutoutChanges(objects, CT_FLOOR, { x: 140, y: 12 }, SINK, counter(200)).changes).toEqual([]);
    expect(countertopCutoutChanges(objects, null, { x: 60, y: 12 }, SINK, counter(200)).changes).toEqual([]);
  });
});
