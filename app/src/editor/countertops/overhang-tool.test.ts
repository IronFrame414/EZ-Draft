// EZD-414 (AC-EZD-414-1 "The Seating preset sets 12" and labels the side "seating""; S04b Preset chips; S15d
// Countertops default overhangs; vault/build/assumptions.md EZD-414). On the EZD-412 two-run L kitchen Trace makes
// A (back wall, x 0 to 144, y 0 to 25 1/2; sides wall, wall, front exposed 1 1/2", wall) and B (left return, corners
// (0,25.5) (0,88.5) (25.5,88.5) (25.5,25.5); sides: wall, end exposed 1 1/2" at y = 88.5, front exposed 1 1/2" at
// x = 25.5, joint to A at y = 25.5). Hand counts:
//   B's end at the Seating preset: 1 1/2" → 12" moves it out 10.5, y = 88.5 → 99.
//   B's front typed 0: 1 1/2" → 0 moves it in 1.5, x = 25.5 → 24; its corner on the joint slides along y = 25.5.
//   A's front at 12" would reach y = 36, into B (which starts at y = 25.5): refused.
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import {
  countertopEdgeAt,
  countertopPresetChanges,
  countertopPresetValues,
  countertopTypedChanges,
} from './overhang-tool';
import { countertopPieces, countertopTraceChanges, countertopTraceDefaults } from './trace-tool';
import { CT_FLOOR, ctId as id, twoRunModel } from './test-fixture';

function traced() {
  const store = createModelStore({ objects: twoRunModel() });
  let n = 100;
  const r = countertopTraceChanges(
    modelObjects(store.getState().objects),
    CT_FLOOR,
    countertopTraceDefaults(null),
    () => id(n++),
  );
  store.applyEdit(r.changes);
  return store;
}
const pieces = (store: ReturnType<typeof createModelStore>) =>
  countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
const byLabel = (store: ReturnType<typeof createModelStore>, label: string) =>
  pieces(store).find((p) => p.data.attributes.label === label)!;

describe('EZD-414 countertopPresetValues', () => {
  it('reads the Defaults overhangs, else the spec numbers, and the floor splash', () => {
    const store = traced();
    expect(countertopPresetValues(null, pieces(store))).toEqual({
      standard: 1.5,
      bar: 10,
      seating: 12,
      againstWall: 0,
      backsplash: 4,
    });
    expect(
      countertopPresetValues(
        { overhang_standard: 1, overhang_seating_counter: 14, overhang_seating_bar: 9, overhang_against_wall: 0.5 },
        [],
      ),
    ).toEqual({ standard: 1, bar: 9, seating: 14, againstWall: 0.5, backsplash: 4 });
  });
});

describe('EZD-414 countertopPresetChanges', () => {
  it('AC-EZD-414-1: the Seating preset sets 12" on the side, marks it seating, one undo step', () => {
    const store = traced();
    const b = byLabel(store, 'B');
    const values = countertopPresetValues(null, pieces(store));
    const changes = countertopPresetChanges(pieces(store), b.id, 1, 'seating', values);
    expect(changes).toHaveLength(1);
    store.applyEdit(changes);
    const after = byLabel(store, 'B');
    expect(after.data.attributes.edges[1]).toMatchObject({ kind: 'seating', overhang: 12 });
    expect(after.data.geometry.outline).toEqual([
      { x: 0, y: 25.5 },
      { x: 0, y: 99 },
      { x: 25.5, y: 99 },
      { x: 25.5, y: 25.5 },
    ]);
    store.undo();
    expect(byLabel(store, 'B').data).toEqual(b.data);
  });

  it('refuses a move that would run one top into the other', () => {
    const store = traced();
    const a = byLabel(store, 'A');
    const values = countertopPresetValues(null, pieces(store));
    expect(countertopPresetChanges(pieces(store), a.id, 2, 'seating', values)).toEqual([]);
    // The front taken in (flush) does not touch B's interior: allowed.
    expect(countertopPresetChanges(pieces(store), a.id, 2, 'flush', values)).toHaveLength(1);
  });

  it('changes nothing when the edge already matches', () => {
    const store = traced();
    const b = byLabel(store, 'B');
    const values = countertopPresetValues(null, pieces(store));
    expect(countertopPresetChanges(pieces(store), b.id, 1, 'standard', values)).toEqual([]);
  });

  it('Wall + splash takes the floor splash', () => {
    const store = traced();
    const b = byLabel(store, 'B');
    const values = countertopPresetValues(null, pieces(store));
    store.applyEdit(countertopPresetChanges(pieces(store), b.id, 1, 'wall', values));
    expect(byLabel(store, 'B').data.attributes.edges[1]).toEqual({
      kind: 'wall',
      overhang: 0,
      backsplashHeight: 4,
      profileId: null,
    });
  });
});

describe('EZD-414 countertopTypedChanges', () => {
  it('a typed 0 makes the front flush and moves it in 1 1/2"', () => {
    const store = traced();
    const b = byLabel(store, 'B');
    store.applyEdit(countertopTypedChanges(pieces(store), b.id, 2, 0));
    const after = byLabel(store, 'B');
    expect(after.data.attributes.edges[2]).toMatchObject({ kind: 'flush', overhang: 0 });
    expect(after.data.geometry.outline[2]).toEqual({ x: 24, y: 88.5 });
    expect(after.data.geometry.outline[3]).toEqual({ x: 24, y: 25.5 });
  });
});

describe('EZD-414 countertopEdgeAt', () => {
  it('picks the edge nearest the click within the radius', () => {
    const store = traced();
    const b = byLabel(store, 'B');
    expect(countertopEdgeAt(pieces(store), { x: 12, y: 88.7 }, 1)).toEqual({ pieceId: b.id, edge: 1 });
    expect(countertopEdgeAt(pieces(store), { x: 12, y: 60 }, 1)).toBeNull();
  });
});
