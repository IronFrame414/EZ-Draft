// EZD-412 (AC-EZD-412-1 "Trace over two runs makes pieces A and B"; S04b Controls "Trace cabinets | Creates tops
// automatically from cabinet runs with default overhangs | Disabled when no cabinets", "Click piece | Selects piece";
// S04b Entry points "Countertops (K) tool on the rail"; S04b Permissions "View projects: view pieces"; S15d "Default
// overhang: Standard 1 1/2"", "Against wall 0 + splash"). Expected values are hand counts, as in
// packages/geometry/src/countertops/trace.test.ts: a back-wall run of four 36" boxes wall to wall makes A 144 x 25 1/2;
// a left-wall run of 30" + 33" boxes from A's front makes B 63 x 25 1/2.
import { countertopPieceAreaSqIn, parseStoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import { modelObjects } from '../cabinets/cabinet-view';
import { editorRail } from '../selection/selection-controller';
import { toolForKey } from '../tools/rail-mode';
import { COUNTERTOPS_RAIL_TOOL, VIEW_TOOL_IDS } from '../tools/tool-defs';
import { catalogFor } from '../../server/messages/catalog';
import {
  canTraceCabinets,
  countertopPieceAt,
  countertopPieces,
  countertopTraceChanges,
  countertopTraceDefaults,
} from './trace-tool';
import { CT_FLOOR, ctId as id, twoRunModel } from './test-fixture';

const counter = () => {
  let n = 100;
  return () => id(n++);
};

describe('EZD-412 Trace cabinets on the countertop screen', () => {
  it('AC-EZD-412-1: trace over two runs makes pieces A and B, one undo step', () => {
    const store = createModelStore({ objects: twoRunModel() });
    const objects = modelObjects(store.getState().objects);
    const r = countertopTraceChanges(objects, CT_FLOOR, countertopTraceDefaults(null), counter());
    expect(r.ids).toEqual([id(100), id(101)]);
    expect(store.applyEdit(r.changes)).toHaveLength(2);

    const after = modelObjects(store.getState().objects);
    const pieces = countertopPieces(after, CT_FLOOR);
    expect(pieces.map((p) => [p.data.attributes.label, p.data.attributes.name])).toEqual([
      ['A', 'Back wall'],
      ['B', 'Left return'],
    ]);
    // Each saved piece passes the stored-object schema.
    for (const p of pieces) {
      const v = store.getState().objects.get(p.id)!;
      expect(
        parseStoredObject({ id: p.id, type: v.type, schema_version: v.schemaVersion, data: v.data })
          .ok,
      ).toBe(true);
    }
    expect(countertopPieceAreaSqIn(pieces[0]!.data)).toBeCloseTo(144 * 25.5, 9);
    expect(countertopPieceAreaSqIn(pieces[1]!.data)).toBeCloseTo(63 * 25.5, 9);

    store.undo();
    expect(countertopPieces(modelObjects(store.getState().objects), CT_FLOOR)).toEqual([]);
  });

  it('uses the Defaults overhangs and falls back to Standard 1 1/2", Against wall 0', () => {
    expect(countertopTraceDefaults(null)).toEqual({ standard: 1.5, againstWall: 0 });
    expect(
      countertopTraceDefaults({ overhang_standard: 1.25, overhang_against_wall: 0.25 }),
    ).toEqual({
      standard: 1.25,
      againstWall: 0.25,
    });
    expect(countertopTraceDefaults({ overhang_standard: null })).toEqual({
      standard: 1.5,
      againstWall: 0,
    });
  });

  it('is disabled with no cabinets on the floor and with no floor', () => {
    const objects = modelObjects(twoRunModel());
    expect(canTraceCabinets(objects, CT_FLOOR)).toBe(true);
    expect(canTraceCabinets(objects, null)).toBe(false);
    const walls = objects.filter((o) => o.type === 'wall' || o.type === 'floor');
    expect(canTraceCabinets(walls, CT_FLOOR)).toBe(false);
    expect(
      countertopTraceChanges(walls, CT_FLOOR, countertopTraceDefaults(null), counter()).changes,
    ).toEqual([]);
  });

  it('a click on a piece selects it; a click off every piece selects none', () => {
    const objects = modelObjects(twoRunModel());
    const r = countertopTraceChanges(objects, CT_FLOOR, countertopTraceDefaults(null), counter());
    const store = createModelStore({ objects: twoRunModel() });
    store.applyEdit(r.changes);
    const pieces = countertopPieces(modelObjects(store.getState().objects), CT_FLOOR);
    expect(countertopPieceAt(pieces, { x: 72, y: 12 })).toBe(id(100));
    expect(countertopPieceAt(pieces, { x: 12, y: 60 })).toBe(id(101));
    expect(countertopPieceAt(pieces, { x: 100, y: 80 })).toBeNull();
  });
});

describe('EZD-412 Countertops (K) on the rail', () => {
  it("is the Countertops tool with shortcut K, after Cabinets, on every viewer's rail and never paused", () => {
    expect(COUNTERTOPS_RAIL_TOOL).toMatchObject({ kind: 'tool', id: 'countertops', shortcut: 'K' });
    expect(catalogFor('office', 'en')['office.tool.countertops']).toBe('Countertops');
    expect(VIEW_TOOL_IDS).toContain('countertops');
    const base = { editor: 'ready' as const, canvasFailed: false, controllerEnabled: true };
    for (const canEdit of [true, false]) {
      const ids = editorRail({ ...base, canEdit })?.tools.map((t) => t.id) ?? [];
      expect(ids[ids.indexOf('cabinets') + 1]).toBe('countertops');
    }
    const locked = editorRail({ ...base, canEdit: false, canEditModel: true });
    expect(locked?.paused).not.toContain('countertops');
  });

  it('K turns it on with or without Edit model', () => {
    const k = {
      key: 'k',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      target: null,
    };
    expect(toolForKey(k, true)).toBe('countertops');
    expect(toolForKey(k, false)).toBe('countertops');
    expect(toolForKey({ ...k, ctrlKey: true }, true)).toBeNull();
  });
});
