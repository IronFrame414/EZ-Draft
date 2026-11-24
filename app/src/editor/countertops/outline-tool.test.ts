// EZD-412 (S04b Controls "Draw outline | Click points to draw a custom top shape; typed lengths | Snaps as in 03",
// "Drag outline vertex | Reshape custom outline", "Esc | As in 03"). Expected values are hand counts.
import { countertopPieceAreaSqIn, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import {
  countertopOutlineChanges,
  countertopVertexChanges,
  INITIAL_OUTLINE_STATE,
  outlineInput,
  outlineSnapTargets,
  type OutlineContext,
  type OutlineToolState,
} from './outline-tool';
import { countertopPieces, countertopTraceChanges, countertopTraceDefaults } from './trace-tool';
import { CT_FLOOR, CT_ISLAND, islandModel, twoRunModel } from './test-fixture';
import { countertopPresetChanges, countertopPresetValues, countertopSupportSettings } from './overhang-tool';

const NEW = 'e0000000-0000-4000-8000-000000000001';
const ctx: OutlineContext = { targets: [], increment: 0.5, radius: 2 };

function run(inputs: Parameters<typeof outlineInput>[1][], c = ctx) {
  let state: OutlineToolState = INITIAL_OUTLINE_STATE;
  let closed: Point[] | null = null;
  for (const i of inputs) {
    const r = outlineInput(state, i, c);
    state = r.state;
    closed = r.closed ?? closed;
  }
  return { state, closed };
}

describe('EZD-412 Draw outline', () => {
  it('clicked corners close on the first corner into a new top labelled with the next letter', () => {
    const { closed, state } = run([
      { type: 'click', at: { x: 200, y: 0 } },
      { type: 'click', at: { x: 260.2, y: 0.3 } },
      { type: 'click', at: { x: 260, y: 30 } },
      { type: 'click', at: { x: 200, y: 30 } },
      { type: 'click', at: { x: 200.5, y: 0.5 } },
    ]);
    expect(state).toEqual(INITIAL_OUTLINE_STATE);
    // The second corner snaps to 0° and 60" at 1/2".
    expect(closed).toEqual([
      { x: 200, y: 0 },
      { x: 260, y: 0 },
      { x: 260, y: 30 },
      { x: 200, y: 30 },
    ]);
    const store = createModelStore({ objects: twoRunModel() });
    const objects = modelObjects(store.getState().objects);
    const traced = countertopTraceChanges(objects, CT_FLOOR, countertopTraceDefaults(null), () =>
      crypto.randomUUID(),
    );
    store.applyEdit(traced.changes);
    const r = countertopOutlineChanges(
      modelObjects(store.getState().objects),
      CT_FLOOR,
      closed!,
      () => NEW,
    );
    expect(r.id).toBe(NEW);
    store.applyEdit(r.changes);
    const c = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR).find(
      (p) => p.id === NEW,
    )!;
    expect(c.data.attributes.label).toBe('C');
    // 60 x 30 = 1800 sq in.
    expect(countertopPieceAreaSqIn(c.data)).toBe(1800);
  });

  it('a typed length places the next corner toward the pointer', () => {
    const { state } = run([
      { type: 'click', at: { x: 0, y: 0 } },
      { type: 'move', at: { x: 0, y: 50 } },
      { type: 'typed', length: 25.5 },
    ]);
    expect(state.draft.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 25.5 },
    ]);
  });

  it('Esc drops the outline being drawn', () => {
    const { state } = run([{ type: 'click', at: { x: 0, y: 0 } }, { type: 'escape' }]);
    expect(state).toEqual(INITIAL_OUTLINE_STATE);
  });

  it('snaps to a cabinet corner', () => {
    const targets = outlineSnapTargets(modelObjects(twoRunModel()), CT_FLOOR);
    expect(targets).toContainEqual({ x: 36, y: 24 });
    const { state } = run([{ type: 'click', at: { x: 35.2, y: 23.4 } }], { ...ctx, targets });
    expect(state.draft.points).toEqual([{ x: 36, y: 24 }]);
  });

  it('dragging a corner reshapes the top in one change', () => {
    const store = createModelStore({ objects: twoRunModel() });
    const square: Point[] = [
      { x: 200, y: 0 },
      { x: 248, y: 0 },
      { x: 248, y: 24 },
      { x: 200, y: 24 },
    ];
    store.applyEdit(
      countertopOutlineChanges(modelObjects(store.getState().objects), CT_FLOOR, square, () => NEW)
        .changes,
    );
    const changes = countertopVertexChanges(modelObjects(store.getState().objects), NEW, 2, {
      x: 260,
      y: 24,
    });
    expect(changes).toHaveLength(1);
    store.applyEdit(changes);
    const p = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR)[0]!;
    // (48 + 60) / 2 x 24 = 1296 sq in.
    expect(countertopPieceAreaSqIn(p.data)).toBe(1296);
    expect(
      countertopVertexChanges(modelObjects(store.getState().objects), NEW, 9, { x: 0, y: 0 }),
    ).toEqual([]);
  });
});

// EZD-415 (assumption EZD-415 "The support requirement on the piece"): a dragged corner works the support out again.
// The board island (test-fixture islandModel) with its back at 12" runs (0, 109.5) to (76.5, 109.5): 4 brackets.
// Its corner 1 dragged to (100.5, 109.5) makes the back 100 1/2" long: ceil(100.5 / 24) = 5 brackets.
describe('EZD-415 corner drag and support', () => {
  it('a longer seating side needs more brackets', () => {
    const AC = { seating_support_limit: 10, countertop_bracket_spacing: 24, countertop_seat_width: 24 };
    const support = countertopSupportSettings(AC);
    const store = createModelStore({ objects: islandModel() });
    const pieces = () => countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
    store.applyEdit(
      countertopPresetChanges(pieces(), CT_ISLAND, 0, 'seating', countertopPresetValues(AC, pieces()), support),
    );
    expect(pieces()[0]!.data.geometry.outline[1]).toEqual({ x: 76.5, y: 109.5 });
    const changes = countertopVertexChanges(
      modelObjects(store.getState().objects),
      CT_ISLAND,
      1,
      { x: 100.5, y: 109.5 },
      support,
    );
    expect(changes).toHaveLength(1);
    store.applyEdit(changes);
    expect(pieces()[0]!.data.attributes.support).toEqual({ overhang: 12, brackets: 5, spacing: 24 });
  });
});
