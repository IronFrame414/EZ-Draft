// EZD-5604b G1-G4 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-3, -8, -9; Q-0474; Q-0638 gap 15). Expected
// points come from the drawing list's rules (drawing/build.ts: a right-side wall's left face on the line, its
// right face 4.5 in. off; fill right, right, left, left), P204b openingSpan (36 in. door at 72: 54 to 90) and
// 8/3 px per inch.
import {
  createOpeningData,
  createWallData,
  CURRENT_SCHEMA_VERSION,
  withObjectNumber,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Change, type Objects } from '../model/patches';
import { arcPoints, planDrawingList } from '../plan/batches';
import { baseObjects, F1, roomValue, uid, wallsOf, withWalls } from '../tools/test-utils/fixtures';
import type { OkPreview } from './apply-reply';
import { EMPTY_PREVIEW_PATHS, previewGeometry, previewPaths } from './preview-shapes';

const T = (p: Point): Point => ({ x: (p.x * 8) / 3, y: (-p.y * 8) / 3 });
const pt = (x: number, y: number): Point => ({ x, y });

function preview(o: Partial<OkPreview> & { changes: Change[] }): OkPreview {
  return { ok: true, added: [], removed: [], updated: [], touched: [], provisional: {}, ...o };
}

// Rounds away float noise (and -0) so points compare by value.
const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const round = (pls: readonly (readonly Point[])[]) =>
  pls.map((pl) => pl.map((p) => ({ x: r(p.x), y: r(p.y) })));

describe('EZD-5604b preview shapes', () => {
  it('G1 an added wall: blue fill and both faces, a chip at its middle, and paths in px', () => {
    const before = baseObjects();
    const wall = withWalls(baseObjects(), 9, [pt(0, 0), pt(144, 0)], false).get(uid(9))!;
    const g = previewGeometry(
      before,
      preview({
        changes: [{ id: uid(9), value: wall }],
        added: [uid(9)],
        touched: [uid(9)],
        provisional: { [uid(9)]: 5 },
      }),
    );
    expect(round(g.addFills)).toEqual([[pt(0, -4.5), pt(144, -4.5), pt(144, 0), pt(0, 0)]]);
    expect(round(g.addLines)).toEqual([
      [pt(0, 0), pt(144, 0)],
      [pt(0, -4.5), pt(144, -4.5)],
    ]);
    expect(g.addLeaves).toEqual([]);
    expect(g.addArcs).toEqual([]);
    expect(g.removeFills).toEqual([]);
    expect(g.removeLines).toEqual([]);
    expect(g.chips).toEqual([{ id: uid(9), kind: 'wall', number: 5, size: 144, at: pt(72, 0) }]);

    const p = previewPaths(g, T);
    expect(p.addFill).toBe('M 0 12 L 384 12 L 384 0 L 0 0 Z');
    expect(p.add).toBe('M 0 0 L 384 0 M 0 12 L 384 12');
    expect(p.addLeaf).toBe('');
    expect(p.addArc).toBe('');
    expect(p.removeFill).toBe('');
    expect(p.remove).toBe('');
    expect(p.chips).toEqual([{ id: uid(9), x: 192, y: 36 }]);
  });

  it('G2 a removed wall red, an updated wall red where it was and blue where it goes', () => {
    const before = withWalls(
      withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false),
      2,
      [pt(0, 120), pt(144, 120)],
      false,
    );
    const moved = createWallData({
      start: pt(0, 6),
      end: pt(144, 6),
      level: F1,
      thicknessSide: 'right',
    });
    if (!moved.ok) throw new Error('wall refused');
    const value: ObjectValue = {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: moved.data as unknown as Record<string, unknown>,
    };
    const g = previewGeometry(
      before,
      preview({
        changes: [
          { id: uid(1), value },
          { id: uid(2), value: null },
        ],
        removed: [uid(2)],
        updated: [uid(1)],
        touched: [uid(1), uid(2)],
      }),
    );
    expect(round(g.removeFills)).toEqual([
      [pt(0, 115.5), pt(144, 115.5), pt(144, 120), pt(0, 120)],
      [pt(0, -4.5), pt(144, -4.5), pt(144, 0), pt(0, 0)],
    ]);
    expect(round(g.removeLines)).toEqual([
      [pt(0, 120), pt(144, 120)],
      [pt(0, 115.5), pt(144, 115.5)],
      [pt(0, 0), pt(144, 0)],
      [pt(0, -4.5), pt(144, -4.5)],
    ]);
    expect(round(g.addFills)).toEqual([[pt(0, 1.5), pt(144, 1.5), pt(144, 6), pt(0, 6)]]);
    expect(round(g.addLines)).toEqual([
      [pt(0, 6), pt(144, 6)],
      [pt(0, 1.5), pt(144, 1.5)],
    ]);
    expect(g.addLeaves).toEqual([]);
    expect(g.addArcs).toEqual([]);
    expect(g.chips).toEqual([]);
  });

  function withOpening(kind: 'door' | 'window') {
    const before = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false);
    const value = withObjectNumber(
      {
        type: 'opening',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: createOpeningData({
          kind,
          host: wallsOf(before)[0]!,
          center: pt(72, 0),
        }) as unknown as Record<string, unknown>,
      } as ObjectValue,
      3,
    );
    const p = preview({
      changes: [{ id: uid(50), value }],
      added: [uid(50)],
      touched: [uid(50)],
      provisional: { [uid(50)]: 3 },
    });
    return { before, p, g: previewGeometry(before, p) };
  }

  it('G3 an added door: span quad, leaf and arc apart, no shape for its host; a window has no leaf', () => {
    const quad = [pt(54, 0), pt(90, 0), pt(90, -4.5), pt(54, -4.5)];
    const { before, p, g } = withOpening('door');
    expect(round(g.addFills)).toEqual([quad]);
    expect(round(g.addLines)).toEqual([[...quad, pt(54, 0)]]);
    const after = applyEditTo(before, makeEdit(before, p.changes), 'forward');
    const items = planDrawingList(after, {}, null, null)!.items.filter((i) => i.objectId === uid(50));
    const leaves = items.flatMap((i) => (i.kind === 'line' ? [[i.from, i.to]] : []));
    const arcs = items.flatMap((i) =>
      i.kind === 'arc' ? [arcPoints(i.center, i.radius, i.startAngle, i.endAngle)] : [],
    );
    expect(leaves).toHaveLength(1);
    expect(arcs).toHaveLength(1);
    expect(g.addLeaves).toEqual(leaves);
    expect(g.addArcs).toEqual(arcs);
    expect(g.removeFills).toEqual([]);
    expect(g.removeLines).toEqual([]);
    expect(g.chips).toEqual([{ id: uid(50), kind: 'door', number: 3, size: 36, at: pt(72, 0) }]);

    const w = withOpening('window').g;
    expect(w.addLeaves).toEqual([]);
    expect(w.addArcs).toEqual([]);
    expect(w.addLines).toHaveLength(4);
    expect(round([w.addLines.at(-1)!])).toEqual([[...quad, pt(54, 0)]]);
    expect(w.chips).toEqual([{ id: uid(50), kind: 'window', number: 3, size: 36, at: pt(72, 0) }]);
  });

  it('G4 rooms and missing ids draw nothing, and the input is not changed', () => {
    const before: Objects = new Map(
      withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0), pt(144, 120)], false),
    ).set(uid(7), roomValue([pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], 'Kitchen', null));
    const copy = structuredClone(before);
    const renamed = roomValue([pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], 'Bath', null);
    const g = previewGeometry(
      before,
      preview({
        changes: [{ id: uid(7), value: renamed }],
        updated: [uid(7)],
        removed: [uid(99)],
        touched: [uid(7), uid(99)],
      }),
    );
    for (const k of [
      'addFills',
      'addLines',
      'addLeaves',
      'addArcs',
      'removeFills',
      'removeLines',
      'chips',
    ] as const) {
      expect(g[k]).toEqual([]);
    }
    expect(previewPaths(g, T)).toEqual(EMPTY_PREVIEW_PATHS);
    expect(before).toEqual(copy);
  });
});
