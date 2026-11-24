// EZD-413 (S04b Controls "Seam | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C)";
// AC-EZD-413-1 "A seam yields two relabeled pieces"; vault/build/assumptions.md EZD-413). On the EZD-412 two-run L
// kitchen, Trace makes A (back wall, 144 x 25 1/2, x 0 to 144, y 0 to 25 1/2) and B (left return, 63 x 25 1/2).
// A seam on A at x = 100 (click x = 100.2 on the 1/2" increment) makes 100 x 25 1/2 (keeps A) and 44 x 25 1/2 (B);
// the old B becomes C.
import {
  countertopSeamCount,
  parseStoredObject,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import { countertopSeamChanges, seamPreviewAt } from './seam-tool';
import { countertopPieces, countertopTraceChanges, countertopTraceDefaults } from './trace-tool';
import { CT_FLOOR, CT_ISLAND, ctId as id, islandModel, twoRunModel } from './test-fixture';
import { countertopPresetChanges, countertopPresetValues, countertopSupportSettings } from './overhang-tool';

const counter = (start: number) => {
  let n = start;
  return () => id(n++);
};

function traced() {
  const store = createModelStore({ objects: twoRunModel() });
  const r = countertopTraceChanges(
    modelObjects(store.getState().objects),
    CT_FLOOR,
    countertopTraceDefaults(null),
    counter(100),
  );
  store.applyEdit(r.changes);
  return store;
}

const size = (o: readonly Point[]) => {
  const xs = o.map((p) => p.x);
  const ys = o.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const listed = (store: ReturnType<typeof createModelStore>) =>
  countertopPieces(modelObjects(store.getState().objects), CT_FLOOR)
    .map((p) => ({ id: p.id, label: p.data.attributes.label, size: size(p.data.geometry.outline) }))
    .sort((a, b) => a.label.localeCompare(b.label));

describe('EZD-413 Seam tool', () => {
  it('AC-EZD-413-1: a seam on A yields two relabeled pieces A and B; the old B becomes C; one undo step', () => {
    const store = traced();
    expect(listed(store).map((p) => p.label)).toEqual(['A', 'B']);
    const r = countertopSeamChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 100.2, y: 12 },
      0.5,
      counter(200),
    );
    expect(r.ids).toEqual([id(100), id(201)]);
    expect(store.applyEdit(r.changes)).toHaveLength(3);
    expect(listed(store)).toEqual([
      { id: id(100), label: 'A', size: [100, 25.5] },
      { id: id(201), label: 'B', size: [44, 25.5] },
      { id: id(101), label: 'C', size: [25.5, 63] },
    ]);
    const after = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
    expect(countertopSeamCount(after.map((p) => p.data))).toBe(1);
    for (const p of after) {
      const v = store.getState().objects.get(p.id)!;
      expect(
        parseStoredObject({ id: p.id, type: v.type, schema_version: v.schemaVersion, data: v.data }).ok,
      ).toBe(true);
    }

    store.undo();
    expect(listed(store).map((p) => [p.id, p.label])).toEqual([
      [id(100), 'A'],
      [id(101), 'B'],
    ]);
  });

  it('a seam on B makes B and C; A is not changed', () => {
    const store = traced();
    const objects = modelObjects(store.getState().objects);
    const b = countertopPieces(objects, CT_FLOOR).find((p) => p.data.attributes.label === 'B')!;
    const xs = b.data.geometry.outline.map((p) => p.x);
    const ys = b.data.geometry.outline.map((p) => p.y);
    // 3" in from the side x = min, 20" up from y = min: the seam runs across at y = min + 20.
    const at = { x: Math.min(...xs) + 3, y: Math.min(...ys) + 20 };
    const r = countertopSeamChanges(objects, CT_FLOOR, at, 0.5, counter(300));
    expect(r.changes.map((c) => c.id)).toEqual([id(101), id(301)]);
    store.applyEdit(r.changes);
    expect(listed(store).map((p) => [p.id, p.label, p.size])).toEqual([
      [id(100), 'A', [144, 25.5]],
      [id(101), 'B', [25.5, 43]],
      [id(301), 'C', [25.5, 20]],
    ]);
  });

  it('a click off every piece makes no seam and no preview', () => {
    const store = traced();
    const objects = modelObjects(store.getState().objects);
    expect(countertopSeamChanges(objects, CT_FLOOR, { x: 100, y: 80 }, 0.5, counter(400))).toEqual({
      changes: [],
      ids: null,
    });
    expect(seamPreviewAt(objects, CT_FLOOR, { x: 100, y: 80 }, 0.5)).toBeNull();
    expect(seamPreviewAt(objects, CT_FLOOR, { x: 100.2, y: 12 }, 0.5)).toEqual({
      pieceId: id(100),
      chord: { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } },
    });
  });
});

// EZD-415 (assumption EZD-415 "The support requirement on the piece"): a seam works out each part's support for its
// own sides, so the parts never both keep the whole top's brackets. The board island (test-fixture islandModel, x 0
// to 76.5) with its back at 12" (y = 109.5) needs ceil(76.5 / 24) = 4 brackets. A seam clicked at x = 54.2 near the
// front (on the 1/2" increment, 22 1/2 from the front's first corner at x = 76.5) cuts at x = 54: the 54" part
// keeps the id, ceil(54 / 24) = 3 brackets; the 22 1/2" part ceil(22.5 / 24) = 1.
describe('EZD-415 seam and support', () => {
  it('each part of a seated top gets its own bracket count', () => {
    const AC = { seating_support_limit: 10, countertop_bracket_spacing: 24, countertop_seat_width: 24 };
    const support = countertopSupportSettings(AC);
    const store = createModelStore({ objects: islandModel() });
    const pieces = () => countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
    store.applyEdit(
      countertopPresetChanges(pieces(), CT_ISLAND, 0, 'seating', countertopPresetValues(AC, pieces()), support),
    );
    expect(pieces()[0]!.data.attributes.support).toEqual({ overhang: 12, brackets: 4, spacing: 24 });
    const r = countertopSeamChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      { x: 54.2, y: 146.5 },
      0.5,
      counter(500),
      support,
    );
    expect(r.ids).not.toBeNull();
    store.applyEdit(r.changes);
    const byId = new Map(pieces().map((p) => [p.id, p.data]));
    expect(size(byId.get(r.ids![0])!.geometry.outline)).toEqual([54, 37.5]);
    expect(size(byId.get(r.ids![1])!.geometry.outline)).toEqual([22.5, 37.5]);
    expect(byId.get(r.ids![0])!.attributes.support).toEqual({ overhang: 12, brackets: 3, spacing: 24 });
    expect(byId.get(r.ids![1])!.attributes.support).toEqual({ overhang: 12, brackets: 1, spacing: 24 });
  });
});
