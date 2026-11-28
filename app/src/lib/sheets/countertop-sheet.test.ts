// EZD-720 (AC-EZD-720-1; vault/build/assumptions/EZD-720.md Settled: A8.0 draws the pieces with seams, cutouts, labels
// and edge tags plus the TOP SCHEDULE; A9.0 draws a section of each edge profile used, each offered profile marked
// "Client choosing" until the client picks; schedule columns piece, material, thickness, area, edge profile, edge
// length, no prices; "schedule values come from the EZD-418 fixture"). The pieces are EZD-418's board tops
// (editor/countertops/test-fixture.ts boardPiecesModel) and the values its hand counts
// (editor/countertops/top-schedule.test.ts):
//   A "Back wall"   25.1 sq ft, 9.7 lf;  B "Left return" 11.2 sq ft, 7.4 lf;  C "Island" 19.9 sq ft, 19.0 lf; 3 cm.
// A and B meet at one seam (CT_SEAM); A has one exposed edge, B two, C three exposed and one seating.
import { describe, expect, it } from 'vitest';
import { parseStoredObject, type DrawingItem } from '@ezdraft/geometry';
import { boardPiecesModel } from '../../editor/countertops/test-fixture';
import {
  CLIENT_CHOOSING,
  NO_COUNTERTOP_NAMES,
  TOP_SCHEDULE_HEADERS,
  TOP_SCHEDULE_TITLE,
  countertopSheetFor,
  edgeDetails,
  topScheduleCells,
  type CountertopSheetNames,
  type CountertopSheetPiece,
} from './countertop-sheet';

const QUARTZ = 'a0000000-0000-4000-8000-000000000001';
const HALF_BULLNOSE = 'b0000000-0000-4000-8000-000000000001';
const OGEE = 'b0000000-0000-4000-8000-000000000005';

function boardPieces(profileOnA: string | null = null, material: string | null = null): CountertopSheetPiece[] {
  const out: CountertopSheetPiece[] = [];
  for (const [id, v] of boardPiecesModel()) {
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (!r.ok || r.object.type !== 'countertop_piece') continue;
    const data = r.object.data;
    const edges = data.attributes.edges.map((e) =>
      data.attributes.label === 'A' && e.kind === 'exposed' ? { ...e, profileId: profileOnA } : e,
    );
    out.push({ id, data: { ...data, attributes: { ...data.attributes, edges, materialItemId: material } } });
  }
  return out;
}

const NAMES = (open: CountertopSheetNames['open'] = []): CountertopSheetNames => ({
  materials: [{ id: QUARTZ, name: 'Quartz' }],
  profiles: [
    { id: HALF_BULLNOSE, key: 'half_bullnose', name: 'Half bullnose' },
    { id: OGEE, key: 'ogee', name: 'Ogee' },
  ],
  open,
});

const texts = (items: readonly DrawingItem[]) =>
  items.flatMap((i) => (i.kind === 'text' ? [i.text] : []));

describe('EZD-720 top schedule on A8.0', () => {
  it('one row per piece in label order with the EZD-418 values; no material or profile reads "—"', () => {
    expect(topScheduleCells(boardPieces(), NO_COUNTERTOP_NAMES)).toEqual([
      ['A - Back wall', '—', '3 cm', '25.1', '—', '9.7'],
      ['B - Left return', '—', '3 cm', '11.2', '—', '7.4'],
      ['C - Island', '—', '3 cm', '19.9', '—', '19.0'],
    ]);
  });

  it('names the material and the edge profile; a top still offered to the client reads CLIENT CHOOSING', () => {
    const pieces = boardPieces(HALF_BULLNOSE, QUARTZ);
    const c = pieces.find((p) => p.data.attributes.label === 'C')!;
    const cells = topScheduleCells(pieces, NAMES([{ pieceId: c.id, profileIds: [HALF_BULLNOSE, OGEE] }]));
    expect(cells.map((r) => [r[1], r[4]])).toEqual([
      ['Quartz', 'Half bullnose'],
      ['Quartz', '—'],
      ['Quartz', CLIENT_CHOOSING],
    ]);
  });

  it('A8.0 draws the plan and the table with the six columns and no price', () => {
    const [plan, table, ...rest] = countertopSheetFor('A8.0', '11x17', boardPieces(), NO_COUNTERTOP_NAMES);
    expect(rest).toEqual([]);
    expect(plan!.marks).toBe(true);
    expect(table!.marks).toBe(false);
    const t = texts(table!.list.items);
    expect(t[0]).toBe(TOP_SCHEDULE_TITLE);
    expect(t.slice(1, 7)).toEqual([...TOP_SCHEDULE_HEADERS]);
    expect(TOP_SCHEDULE_HEADERS).toEqual(['PIECE', 'MATERIAL', 'THICKNESS', 'AREA (SQ FT)', 'EDGE PROFILE', 'EDGE (LF)']);
    expect(t.some((x) => x.includes('$'))).toBe(false);
    // The table sits under the plan.
    expect(table!.area.y).toBeGreaterThan(plan!.area.y + plan!.area.height);
  });

  it('the plan labels each piece, draws the one seam dashed, and tags the exposed edges with their A9.0 detail', () => {
    const pieces = boardPieces(HALF_BULLNOSE);
    const c = pieces.find((p) => p.data.attributes.label === 'C')!;
    const [plan] = countertopSheetFor('A8.0', '11x17', pieces, NAMES([{ pieceId: c.id, profileIds: [HALF_BULLNOSE, OGEE] }]));
    const t = texts(plan!.list.items);
    expect(t.filter((x) => ['A', 'B', 'C'].includes(x)).sort()).toEqual(['A', 'B', 'C']);
    expect(plan!.list.items.filter((i) => i.kind === 'line' && i.role === 'hidden')).toHaveLength(1);
    // A: its one exposed edge carries half bullnose, detail 1. C: three exposed and one seating edge, offered 1 and 2.
    expect(t.filter((x) => x === '1/A9.0')).toHaveLength(1);
    expect(t.filter((x) => x === '1,2/A9.0')).toHaveLength(4);
  });
});

describe('EZD-720 overhangs on A8.0', () => {
  // The fixture's overhangs (test-fixture.ts boardEdge): 1.5 in on each exposed edge, 12 in on the seating edge, none
  // on wall and seam edges. A: 1 exposed; B: 2 exposed; C: 3 exposed and 1 seating. Written as packages/geometry
  // length.ts formatLength at 1/16 (length.test.ts: 6.5 -> 6 1/2", 12.5 -> 1' 0 1/2", so 1.5 -> 1 1/2", 12 -> 1' 0").
  it('notes each overhanging edge with its overhang', () => {
    const [plan] = countertopSheetFor('A8.0', '11x17', boardPieces(), NO_COUNTERTOP_NAMES);
    const t = texts(plan!.list.items);
    expect(t.filter((x) => x === '1 1/2" OH')).toHaveLength(6);
    expect(t.filter((x) => x === `1' 0" OH`)).toHaveLength(1);
  });
});

describe('EZD-720 edge details on A9.0', () => {
  it('one detail per profile used or offered, numbered in label order; only-offered profiles are client choosing', () => {
    const pieces = boardPieces(HALF_BULLNOSE);
    const c = pieces.find((p) => p.data.attributes.label === 'C')!;
    const d = edgeDetails(pieces, NAMES([{ pieceId: c.id, profileIds: [HALF_BULLNOSE, OGEE] }]));
    expect(d.map((x) => [x.number, x.key, x.name, x.choosing])).toEqual([
      [1, 'half_bullnose', 'Half bullnose', false],
      [2, 'ogee', 'Ogee', true],
    ]);
  });

  it('A9.0 draws a section and its name for each detail, CLIENT CHOOSING under an offered one', () => {
    const pieces = boardPieces(HALF_BULLNOSE);
    const c = pieces.find((p) => p.data.attributes.label === 'C')!;
    const drawn = countertopSheetFor('A9.0', '11x17', pieces, NAMES([{ pieceId: c.id, profileIds: [OGEE] }]));
    const all = texts(drawn.flatMap((x) => x.list.items));
    expect(all).toEqual(['1  HALF BULLNOSE', '2  OGEE', CLIENT_CHOOSING]);
    // A half bullnose section has its rounded edge; an ogee two arcs.
    const arcs = drawn.map((x) => x.list.items.filter((i) => i.kind === 'arc').length);
    expect(arcs).toEqual([1, 0, 2, 0]);
  });

  it('with no profile picked or offered A9.0 draws nothing', () => {
    expect(countertopSheetFor('A9.0', '11x17', boardPieces(), NAMES())).toEqual([]);
  });
});

describe('EZD-720 other sheets and no pieces', () => {
  it('draws nothing on any other sheet, nor with no piece', () => {
    for (const sheet of ['A0.0', 'A3.0', 'A4.0', 'R1.0'])
      expect(countertopSheetFor(sheet, '24x36', boardPieces(HALF_BULLNOSE), NAMES())).toEqual([]);
    expect(countertopSheetFor('A8.0', '11x17', [], NAMES())).toEqual([]);
  });
});
