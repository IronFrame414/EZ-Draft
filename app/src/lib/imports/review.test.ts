// EZD-307 (AC-EZD-307-1 counts; S02 Controls Summary line, To check row, Accepted summary; Data shown). Items are
// written by hand from fixtures/synthetic/room-12x10-unjoined.dxf.expected.json (four walls 4.5 in thick: S 144,
// E 118 with one joined end, N 144, W 120; a 36 in door and a 36 in window on the south wall; one closed 120 SF
// room) with the confidences of EZD-302's scoring (vault/build/assumptions.md EZD-302: paired wall 95 less 25 per
// unjoined end, so the east wall 70; door with leaf 90; window of three lines 90; closed room 90). The cutoff is
// HIGH_CONFIDENCE_CUTOFF = 80 (vault/build/assumptions.md EZD-307). Never from a run.
import { describe, expect, it } from 'vitest';
import {
  itemLabel,
  itemTypeWord,
  reviewSummary,
  scanReads,
  sourceLine,
  toCheckItems,
  type ReviewItem,
} from './review';

const wall = (
  id: string,
  number: number,
  side: 'north' | 'east' | 'south' | 'west',
  confidence: number,
  start: [number, number],
  end: [number, number],
): ReviewItem => ({
  id,
  type: 'wall',
  number,
  side,
  confidence,
  geometry: { start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] } },
  thickness: 4.5,
});

const ITEMS: ReviewItem[] = [
  wall('w1', 1, 'south', 95, [144, 0], [0, 0]),
  wall('w2', 2, 'east', 70, [144, 118], [144, 0]),
  wall('w3', 3, 'north', 95, [0, 120], [144, 120]),
  wall('w4', 4, 'west', 95, [0, 0], [0, 120]),
  {
    id: 'd1',
    type: 'opening',
    kind: 'door',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    width: 36,
    center: { x: 30, y: 0 },
  },
  {
    id: 'n1',
    type: 'opening',
    kind: 'window',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    width: 36,
    center: { x: 102, y: 0 },
  },
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 90,
    boundary: [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
    areaSqIn: 17280,
  },
];

describe('EZD-307 import review data', () => {
  it('AC-EZD-307-1: the summary line counts found, high confidence and to check', () => {
    const s = reviewSummary(ITEMS);
    expect(s.found).toBe(7);
    expect(s.highConfidence).toBe(6);
    expect(s.toCheck).toBe(1);
  });

  it('AC-EZD-307-1: Accepted counts the high-confidence items by type', () => {
    expect(reviewSummary(ITEMS).accepted).toEqual({
      walls: 3,
      windows: 1,
      doors: 1,
      rooms: 1,
      fixtures: 0,
    });
  });

  it('lists only items below the cutoff in To check, highest confidence first', () => {
    expect(toCheckItems(ITEMS).map((i) => i.id)).toEqual(['w2']);
    const more = [
      ...ITEMS,
      { ...ITEMS[4], id: 'd2', number: 2, confidence: 55 },
      { ...ITEMS[5], id: 'n2', number: 2, confidence: 75 },
    ] as ReviewItem[];
    expect(toCheckItems(more).map((i) => i.id)).toEqual(['n2', 'w2', 'd2']);
    // At the cutoff counts as high confidence (S02: "below the high-confidence cutoff goes to To check").
    expect(toCheckItems(ITEMS, 95).map((i) => i.id)).toEqual(['d1', 'n1', 'r1', 'w2']);
  });

  it('labels items as the board does', () => {
    expect(itemLabel(ITEMS[1], ITEMS)).toBe('East wall');
    expect(itemLabel(ITEMS[4], ITEMS)).toBe('Door D1');
    expect(itemLabel(ITEMS[5], ITEMS)).toBe('Window W1');
    expect(itemLabel(ITEMS[6], ITEMS)).toBe('Room 1');
    const twoNorth = [...ITEMS, wall('w5', 5, 'north', 60, [0, 60], [60, 60])];
    expect(itemLabel(twoNorth[2], twoNorth)).toBe('North wall 3');
    expect(itemLabel(twoNorth[7], twoNorth)).toBe('North wall 5');
    expect(itemTypeWord(ITEMS[1])).toBe('Wall');
    expect(itemTypeWord(ITEMS[5])).toBe('Window');
  });

  it('reads the scan value: wall length, opening width, room area', () => {
    expect(scanReads(ITEMS[1])).toBe(`9' 10"`);
    expect(scanReads(ITEMS[0])).toBe(`12' 0"`);
    expect(scanReads(ITEMS[4])).toBe(`3' 0"`);
    expect(scanReads(ITEMS[6])).toBe('120 SF');
  });

  it('names the source as board S02 does', () => {
    const files = [
      { name: 'family-room.dxf', kind: 'polycam_dxf' },
      { name: 'mesh.glb', kind: 'polycam_glb' },
    ];
    expect(sourceLine(files)).toBe('Polycam Space · DXF + GLB');
    expect(sourceLine(files.slice(0, 1))).toBe('Polycam Space · DXF');
  });
});
