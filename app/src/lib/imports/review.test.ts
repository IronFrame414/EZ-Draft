// EZD-307 (AC-EZD-307-1 counts; S02 Controls Summary line, To check row, Accepted summary; Data shown). Items are
// written by hand from fixtures/synthetic/room-12x10-unjoined.dxf.expected.json (four walls 4.5 in thick: S 144,
// E 118 with one joined end, N 144, W 120; a 36 in door and a 36 in window on the south wall; one closed 120 SF
// room) with the confidences of EZD-302's scoring (vault/build/assumptions.md EZD-302: paired wall 95 less 25 per
// unjoined end, so the east wall 70; door with leaf 90; window of three lines 90; closed room 90). The cutoff is
// 80, the EZD-307 value and EZD-308's fallback when the Defaults cutoff is Not set (vault/build/assumptions.md
// EZD-307, EZD-308). Never from a run.
import { describe, expect, it } from 'vitest';
import {
  acceptHighConfidence,
  decide,
  DEFAULT_HIGH_CONFIDENCE_CUTOFF,
  firstUnresolved,
  itemLabel,
  pendingHighConfidence,
  reviewCutoff,
  roomGroups,
  stepItem,
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

const CUTOFF = 80;

describe('EZD-307 import review data', () => {
  it('AC-EZD-307-1: the summary line counts found, high confidence and to check', () => {
    const s = reviewSummary(ITEMS, CUTOFF);
    expect(s.found).toBe(7);
    expect(s.highConfidence).toBe(6);
    expect(s.toCheck).toBe(1);
  });

  it('AC-EZD-307-1: Accepted counts the items accepted, by type (after Accept N: the high-confidence ones)', () => {
    expect(reviewSummary(ITEMS, CUTOFF).accepted).toEqual({
      walls: 0,
      windows: 0,
      doors: 0,
      rooms: 0,
      fixtures: 0,
    });
    const after = acceptHighConfidence(ITEMS, CUTOFF, {});
    expect(reviewSummary(ITEMS, CUTOFF, after).accepted).toEqual({
      walls: 3,
      windows: 1,
      doors: 1,
      rooms: 1,
      fixtures: 0,
    });
  });

  it('lists only items below the cutoff in To check, highest confidence first', () => {
    expect(toCheckItems(ITEMS, CUTOFF).map((i) => i.id)).toEqual(['w2']);
    const more = [
      ...ITEMS,
      { ...ITEMS[4], id: 'd2', number: 2, confidence: 55 },
      { ...ITEMS[5], id: 'n2', number: 2, confidence: 75 },
    ] as ReviewItem[];
    expect(toCheckItems(more, CUTOFF).map((i) => i.id)).toEqual(['n2', 'w2', 'd2']);
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

// EZD-308 (AC-EZD-308-1 "Accept N accepts only items above the cutoff"; S02 Controls Mode One by one, Accept + fix,
// By room, Accept N; Decisions "Accept N accepts only high-confidence items. Each To check item needs its own
// action"). The same hand-written items (S, N, W walls 95; E wall 70; door, window and room 90). An item exactly
// at the cutoff is high confidence: S02 Validation sends only items *below* the cutoff to To check, and the EZD-307
// assumption counts one at the cutoff as high, so "above" in the AC is read as "at or above".
describe('EZD-308 review modes', () => {
  const ids = (d: Record<string, string>, v: string) =>
    Object.keys(d)
      .filter((k) => d[k] === v)
      .sort();

  it('AC-EZD-308-1: Accept N accepts only the items above the company cutoff (91: the three 95 walls)', () => {
    expect(pendingHighConfidence(ITEMS, 91, {}).map((i) => i.id)).toEqual(['w1', 'w3', 'w4']);
    const after = acceptHighConfidence(ITEMS, 91, {});
    expect(ids(after, 'accepted')).toEqual(['w1', 'w3', 'w4']);
    // The 90 items and the 70 wall stay unresolved, still To check.
    expect(toCheckItems(ITEMS, 91, after).map((i) => i.id)).toEqual(['d1', 'n1', 'r1', 'w2']);
    expect(pendingHighConfidence(ITEMS, 91, after)).toEqual([]);
  });

  it('AC-EZD-308-1: an item at the cutoff is accepted; one below it never is (cutoff 90)', () => {
    const after = acceptHighConfidence(ITEMS, 90, {});
    expect(ids(after, 'accepted')).toEqual(['d1', 'n1', 'r1', 'w1', 'w3', 'w4']);
    expect(after.w2).toBeUndefined();
    expect(reviewSummary(ITEMS, 90, after)).toEqual({
      found: 7,
      highConfidence: 6,
      toCheck: 1,
      accepted: { walls: 3, windows: 1, doors: 1, rooms: 1, fixtures: 0 },
    });
  });

  it('Accept N leaves a rejected high-confidence item rejected, and N counts only unresolved ones', () => {
    const before = decide({}, 'w1', 'rejected');
    expect(pendingHighConfidence(ITEMS, CUTOFF, before)).toHaveLength(5);
    const after = acceptHighConfidence(ITEMS, CUTOFF, before);
    expect(after.w1).toBe('rejected');
    expect(ids(after, 'accepted')).toEqual(['d1', 'n1', 'r1', 'w3', 'w4']);
  });

  it('a To check item leaves the list and the to check count once it is accepted or rejected', () => {
    const d = decide({}, 'w2', 'accepted');
    expect(toCheckItems(ITEMS, CUTOFF, d)).toEqual([]);
    expect(reviewSummary(ITEMS, CUTOFF, d).toCheck).toBe(0);
    expect(reviewSummary(ITEMS, CUTOFF, d).accepted.walls).toBe(1);
    const r = decide({}, 'w2', 'rejected');
    expect(reviewSummary(ITEMS, CUTOFF, r).toCheck).toBe(0);
    expect(reviewSummary(ITEMS, CUTOFF, r).accepted.walls).toBe(0);
  });

  it('One by one steps through every item in detection order and stops at the ends', () => {
    expect(stepItem(ITEMS, null, 1)).toBe('w1');
    expect(stepItem(ITEMS, 'w1', 1)).toBe('w2');
    expect(stepItem(ITEMS, 'w2', -1)).toBe('w1');
    expect(stepItem(ITEMS, 'w1', -1)).toBe('w1');
    expect(stepItem(ITEMS, 'r1', 1)).toBe('r1');
    expect(stepItem([], null, 1)).toBeNull();
    // It starts at the first unresolved item; with every item resolved, at the first.
    expect(firstUnresolved(ITEMS, {})).toBe('w1');
    expect(firstUnresolved(ITEMS, acceptHighConfidence(ITEMS, 91, {}))).toBe('w2');
    expect(firstUnresolved(ITEMS, acceptHighConfidence(ITEMS, 0, {}))).toBe('w1');
    expect(firstUnresolved([], {})).toBeNull();
  });

  it('By room puts every wall on a room boundary, and its openings, under that room', () => {
    expect(roomGroups(ITEMS).map((g) => [g.room?.id ?? null, g.items.map((i) => i.id)])).toEqual([
      ['r1', ['r1', 'w1', 'w2', 'w3', 'w4', 'd1', 'n1']],
    ]);
  });

  it('By room: a shared wall goes to the lower room number; items in no room are grouped last', () => {
    const r2: ReviewItem = {
      id: 'r2',
      type: 'room',
      number: 2,
      confidence: 90,
      boundary: [
        { x: 144, y: 0 },
        { x: 264, y: 0 },
        { x: 264, y: 120 },
        { x: 144, y: 120 },
      ],
      closed: true,
      areaSqIn: 14400,
    };
    const items: ReviewItem[] = [
      r2,
      ...ITEMS,
      wall('w5', 5, 'east', 95, [264, 0], [264, 120]),
      wall('w6', 6, 'north', 95, [500, 500], [600, 500]),
      { ...(ITEMS[5] as ReviewItem & { type: 'opening' }), id: 'n2', hostWallId: null, center: { x: 264, y: 60 } },
      { ...(ITEMS[5] as ReviewItem & { type: 'opening' }), id: 'n3', hostWallId: null, center: { x: 550, y: 400 } },
    ];
    expect(roomGroups(items).map((g) => [g.room?.id ?? null, g.items.map((i) => i.id)])).toEqual([
      ['r1', ['r1', 'w1', 'w2', 'w3', 'w4', 'd1', 'n1']],
      ['r2', ['r2', 'w5', 'n2']],
      [null, ['w6', 'n3']],
    ]);
    // Accepting a room accepts only its high-confidence items (the same rule as Accept N).
    const room1 = roomGroups(items)[0].items;
    expect(ids(acceptHighConfidence(room1, CUTOFF, {}), 'accepted')).toEqual([
      'd1',
      'n1',
      'r1',
      'w1',
      'w3',
      'w4',
    ]);
  });

  it('uses the Defaults cutoff when set, else 80', () => {
    expect(reviewCutoff(91)).toBe(91);
    expect(reviewCutoff(0)).toBe(0);
    expect(reviewCutoff(null)).toBe(80);
    expect(reviewCutoff('91')).toBe(80);
    expect(DEFAULT_HIGH_CONFIDENCE_CUTOFF).toBe(80);
  });
});
