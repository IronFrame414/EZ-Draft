// EZD-733 (AC-EZD-733-1; S19 "Tile pattern select | Straight / diagonal / herringbone"; 09i Tile "pattern, start
// point, visible cuts"; vault/build/assumptions.md EZD-733). Expected values are hand arithmetic on the tile sizes:
// a 60" x 24" face in 12" tiles is 60 / 12 = 5 columns and 24 / 12 = 2 rows; moving the start 6" leaves a 6" cut at
// each end; a 1/8" joint makes the pitch 12 1/8", so the fifth column starts at 4 x 12.125 = 48.5" and is cut to
// 60 - 48.5 = 11.5", and the second row starts at 12.125" and is cut to 24 - 12.125 = 11.875".
import { describe, expect, it } from 'vitest';
import type { Point } from '../schema';
import { MAX_TILE_PIECES, clipToConvex, tilePieceArea, tilePieces, type TilePiece } from './layout';

const rect = (w: number, h: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
const bounds = (p: TilePiece) => ({
  x0: Math.min(...p.points.map((q) => q.x)),
  x1: Math.max(...p.points.map((q) => q.x)),
  y0: Math.min(...p.points.map((q) => q.y)),
  y1: Math.max(...p.points.map((q) => q.y)),
});
const total = (ps: TilePiece[]) => ps.reduce((s, p) => s + tilePieceArea(p), 0);
const straight = { pattern: 'straight' as const, tileWidth: 12, tileHeight: 12, joint: 0 };

describe('EZD-733 tile pieces', () => {
  it('straight 12" tile from the corner of a 60" x 24" face: 10 whole tiles, no cuts', () => {
    const r = tilePieces(rect(60, 24), straight, { x: 0, y: 0 });
    expect(r.tooMany).toBe(false);
    expect(r.pieces).toHaveLength(10);
    expect(r.pieces.filter((p) => p.cut)).toHaveLength(0);
  });

  it('AC-EZD-733-1: moving the start 6" along puts a 6" cut at each end', () => {
    const r = tilePieces(rect(60, 24), straight, { x: 6, y: 0 });
    const cuts = r.pieces.filter((p) => p.cut).map(bounds);
    expect(r.pieces).toHaveLength(12);
    expect(cuts).toHaveLength(4);
    const xs = [...new Set(cuts.map((b) => `${b.x0}-${b.x1}`))].sort();
    expect(xs).toEqual(['0-6', '54-60']);
    for (const p of r.pieces.filter((x) => x.cut)) expect(tilePieceArea(p)).toBeCloseTo(6 * 12, 9);
  });

  it('a 1/8" joint: the fifth column is cut to 11 1/2" and the second row to 11 7/8"', () => {
    const r = tilePieces(rect(60, 24), { ...straight, joint: 0.125 }, { x: 0, y: 0 });
    expect(r.pieces).toHaveLength(10);
    const row1 = r.pieces.map(bounds).filter((b) => b.y0 === 0);
    const row2 = r.pieces.map(bounds).filter((b) => b.y0 > 0);
    expect(row1.map((b) => b.x0).sort((a, b) => a - b)).toEqual([0, 12.125, 24.25, 36.375, 48.5]);
    expect(row1.find((b) => b.x0 === 48.5)!.x1).toBe(60);
    expect(r.pieces.filter((p) => p.cut)).toHaveLength(6);
    for (const b of row2) {
      expect(b.y0).toBe(12.125);
      expect(b.y1).toBe(24);
    }
  });

  it('a start point outside the face lays the same grid (start 72" = start 0" for 12" tiles)', () => {
    const a = tilePieces(rect(60, 24), straight, { x: 72, y: -24 });
    expect(a.pieces).toHaveLength(10);
    expect(a.pieces.filter((p) => p.cut)).toHaveLength(0);
  });

  it('an L-shaped room: whole tiles from the corner; moved 6" each way every piece is cut and the area stays 432 SF in', () => {
    // 24" x 24" less the 12" x 12" corner: 576 - 144 = 432 sq in.
    const L: Point[] = [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 24, y: 12 },
      { x: 12, y: 12 },
      { x: 12, y: 24 },
      { x: 0, y: 24 },
    ];
    const a = tilePieces(L, straight, { x: 0, y: 0 });
    expect(a.pieces).toHaveLength(3);
    expect(a.pieces.every((p) => !p.cut)).toBe(true);
    const b = tilePieces(L, straight, { x: 6, y: 6 });
    expect(b.pieces.every((p) => p.cut)).toBe(true);
    expect(total(b.pieces)).toBeCloseTo(432, 9);
  });

  it('diagonal: the start tile is the 12" square turned 45 degrees on its corner', () => {
    const r = tilePieces(rect(40, 40), { ...straight, pattern: 'diagonal' }, { x: 20, y: 20 });
    const h = 12 * Math.SQRT1_2; // 8.485"
    const whole = r.pieces.find(
      (p) =>
        !p.cut &&
        p.points.some((q) => Math.abs(q.x - 20) < 1e-9 && Math.abs(q.y - 20) < 1e-9) &&
        p.points.some((q) => Math.abs(q.x - (20 + h)) < 1e-9 && Math.abs(q.y - (20 + h)) < 1e-9),
    );
    expect(whole).toBeDefined();
    expect(tilePieceArea(whole!)).toBeCloseTo(144, 9);
    // Butted tiles cover the face exactly: 40 x 40 = 1600 sq in, and the edges are cut.
    expect(total(r.pieces)).toBeCloseTo(1600, 6);
    expect(r.pieces.some((p) => p.cut)).toBe(true);
  });

  it('herringbone 3" x 6": the start tile turned -45 degrees, and butted tiles cover the face once', () => {
    const spec = { pattern: 'herringbone' as const, tileWidth: 3, tileHeight: 6, joint: 0 };
    const r = tilePieces(rect(40, 40), spec, { x: 20, y: 20 });
    const c = Math.SQRT1_2;
    // The 6" x 3" tile [0, 6] x [0, 3] turned -45 degrees: corners (0, 0), (6c, -6c), (9c, -3c), (3c, 3c).
    const want = [
      { x: 20, y: 20 },
      { x: 20 + 6 * c, y: 20 - 6 * c },
      { x: 20 + 9 * c, y: 20 - 3 * c },
      { x: 20 + 3 * c, y: 20 + 3 * c },
    ];
    const start = r.pieces.find((p) =>
      want.every((w) =>
        p.points.some((q) => Math.abs(q.x - w.x) < 1e-9 && Math.abs(q.y - w.y) < 1e-9),
      ),
    );
    expect(start?.cut).toBe(false);
    expect(total(r.pieces)).toBeCloseTo(1600, 6);
    // Every sample point (off the joints) lies in exactly one piece.
    const inside = (ring: Point[], p: Point) => {
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cr > 0) s |= 1;
        if (cr < 0) s |= 2;
      }
      return s !== 3;
    };
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 12; j++) {
        const p = { x: 1.3137 + i * 3.1171, y: 0.7219 + j * 3.2893 };
        expect(r.pieces.filter((q) => inside(q.points, p))).toHaveLength(1);
      }
  });

  it('a joint leaves the pieces smaller than the face; herringbone with a 1/8" joint covers less than butted', () => {
    const spec = { pattern: 'herringbone' as const, tileWidth: 3, tileHeight: 6, joint: 0.125 };
    const r = tilePieces(rect(40, 40), spec, { x: 20, y: 20 });
    expect(total(r.pieces)).toBeLessThan(1600);
    expect(r.pieces.length).toBeGreaterThan(0);
  });

  it('more tiles than the limit draws nothing and says so (1" tile on a 200" x 200" floor = 40,000)', () => {
    const r = tilePieces(
      rect(200, 200),
      { ...straight, tileWidth: 1, tileHeight: 1 },
      { x: 0, y: 0 },
    );
    expect(MAX_TILE_PIECES).toBe(20000);
    expect(r).toEqual({ pieces: [], tooMany: true });
  });

  it('clipToConvex: a 10" square cut by a square across its corner leaves a 5" x 5" piece', () => {
    const out = clipToConvex(rect(10, 10), [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ]);
    expect(tilePieceArea({ points: out, cut: true })).toBe(25);
  });
});
