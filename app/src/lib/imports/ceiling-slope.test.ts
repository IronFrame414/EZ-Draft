// EZD-312 (AC-EZD-312-1 "A slope item saves by each of the three inputs"; S02 Decisions "heights at points
// (low/high wall), pitch, or the value read from the mesh"). Expected values come from the hand-written
// fixtures/synthetic/room-12x10-sloped.glb.expected.json: a 144 x 120 in room whose ceiling is 96 in at the west
// (low) wall and 144 in at the east (high) wall, 4 rise per 12 run (`interior.widthIn` 144, `ceiling.lowWall`,
// `ceiling.highWall`, `ceiling.pitchPer12`). Worked by hand: points 96 / 144 over a 144 in run is
// 12 × 48 ÷ 144 = 4/12; pitch 4 from 96 rises 4 × 144 ÷ 12 = 48 to 144; pitch 6 from 96 rises 72 to 168.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importObjects, importedCounts } from '../../server/imports/finish-import';
import {
  parseSlopeFix,
  slopeByPitch,
  slopeByPoints,
  slopeFromMesh,
  type CeilingSlopeFix,
} from './ceiling-slope';
import { readCeiling } from './polycam-glb/ceiling';
import { readGlb } from './polycam-glb/read-glb';
import {
  itemLabel,
  itemTypeWord,
  reviewSummary,
  roomGroups,
  scanReads,
  type ReviewCeilingSlope,
  type ReviewItem,
} from './review';
import { applyFix, changeFor, finishItems, parseFix, withFix } from './review-fix';
import { parsePitch } from '../../editor/import-review/CeilingSlope';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GLB = 'fixtures/synthetic/room-12x10-sloped.glb';
const expected = JSON.parse(readFileSync(path.join(repo, `${GLB}.expected.json`), 'utf8')) as {
  tolerances: { inches: number; pitchPer12: number };
  interior: { widthIn: number };
  ceiling: {
    lowWall: { heightIn: number };
    highWall: { heightIn: number };
    pitchPer12: number;
  };
};

const SLOPE: ReviewCeilingSlope = {
  id: 's1',
  type: 'ceiling_slope',
  number: 1,
  confidence: 47,
  roomId: 'r1',
  lowSide: 'west',
  highSide: 'east',
  run: expected.interior.widthIn,
  // The scan read a little off; the fixes below set the true values.
  lowHeight: 95,
  highHeight: 140,
  pitchPer12: 3.75,
};
const ROOM: ReviewItem = {
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
};
const WALL: ReviewItem = {
  id: 'w1',
  type: 'wall',
  number: 1,
  side: 'south',
  confidence: 95,
  geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
  thickness: 4.5,
};
const ITEMS: ReviewItem[] = [WALL, ROOM, SLOPE];

const fixOf = (r: ReturnType<typeof slopeByPoints>): CeilingSlopeFix => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.fix;
};

describe('EZD-312 ceiling slope inputs', () => {
  it('heights at points: low 96, high 144 over a 144 in run is 4/12', () => {
    const fix = fixOf(slopeByPoints(SLOPE, 96, 144));
    expect(fix).toEqual({ input: 'points', lowHeight: 96, highHeight: 144, pitchPer12: 4 });
  });

  it('pitch: 4/12 from a 96 in low wall reaches 144 in at the high wall; 6/12 reaches 168', () => {
    expect(fixOf(slopeByPitch(SLOPE, 96, 4))).toEqual({
      input: 'pitch',
      lowHeight: 96,
      highHeight: 144,
      pitchPer12: 4,
    });
    expect(fixOf(slopeByPitch(SLOPE, 96, 6)).highHeight).toBe(168);
  });

  it('the value read from the mesh: the fixture GLB gives 96, 144 and 4/12', () => {
    const reading = readCeiling(readGlb(new Uint8Array(readFileSync(path.join(repo, GLB)))));
    const fix = fixOf(slopeFromMesh(reading));
    expect(fix.input).toBe('mesh');
    const tol = expected.tolerances;
    expect(Math.abs(fix.lowHeight - expected.ceiling.lowWall.heightIn)).toBeLessThanOrEqual(tol.inches);
    expect(Math.abs(fix.highHeight - expected.ceiling.highWall.heightIn)).toBeLessThanOrEqual(
      tol.inches,
    );
    expect(Math.abs(fix.pitchPer12 - expected.ceiling.pitchPer12)).toBeLessThanOrEqual(
      tol.pitchPer12,
    );
  });

  it('refuses a missing ceiling, a zero height, a high wall below the low wall and a pitch over 24/12', () => {
    expect(slopeFromMesh(null)).toEqual({ ok: false, reason: 'no_ceiling' });
    expect(slopeByPoints(SLOPE, 0, 144)).toEqual({ ok: false, reason: 'height' });
    expect(slopeByPoints(SLOPE, 144, 96)).toEqual({ ok: false, reason: 'order' });
    expect(slopeByPitch(SLOPE, 96, 25)).toEqual({ ok: false, reason: 'pitch' });
    expect(slopeByPitch(SLOPE, 96, -1)).toEqual({ ok: false, reason: 'pitch' });
  });

  it('a typed pitch reads 4, 9.4 and 4/12', () => {
    expect(parsePitch('4')).toBe(4);
    expect(parsePitch('9.4')).toBe(9.4);
    expect(parsePitch(' 4/12 ')).toBe(4);
    expect(parsePitch('4/10')).toBeNull();
    expect(parsePitch('steep')).toBeNull();
  });
});

describe('EZD-312 a slope fix is a review fix', () => {
  const fixes = {
    points: fixOf(slopeByPoints(SLOPE, 96, 144)),
    pitch: fixOf(slopeByPitch(SLOPE, 96, 6)),
    mesh: { input: 'mesh', lowHeight: 96, highHeight: 144, pitchPer12: 4 } as CeilingSlopeFix,
  };

  it.each(Object.entries(fixes))(
    'by %s: fixing accepts the item, the saved row carries the fix, and it reads back the same',
    (_input, fix) => {
      const state = withFix({ decisions: {}, fixes: {} }, 's1', fix);
      expect(state.decisions.s1).toBe('accepted');
      const row = changeFor(state, 's1');
      expect(row).toEqual({ item_id: 's1', decision: 'accepted', fix });
      // What the database stores is JSON; it parses back to the same fix.
      expect(parseFix(SLOPE, JSON.parse(JSON.stringify(row.fix)))).toEqual(fix);
      expect(applyFix(SLOPE, fix)).toMatchObject({
        lowHeight: fix.lowHeight,
        highHeight: fix.highHeight,
        pitchPer12: fix.pitchPer12,
      });
    },
  );

  it('a stored fix of the wrong shape is dropped', () => {
    expect(parseFix(SLOPE, { input: 'guess', lowHeight: 96, highHeight: 144, pitchPer12: 4 })).toBeNull();
    expect(parseFix(SLOPE, { input: 'points', lowHeight: 144, highHeight: 96, pitchPer12: 4 })).toBeNull();
    expect(parseSlopeFix({ boundary: [] })).toBeNull();
  });

  it('is listed as "Ceiling slope, east" (board S02), with its room, and counts as no wall, door or window', () => {
    expect(itemLabel(SLOPE, ITEMS)).toBe('Ceiling slope, east');
    expect(itemTypeWord(SLOPE)).toBe('Ceiling');
    expect(scanReads(SLOPE)).toBe(`7' 11" to 11' 8" · 3.8/12`);
    const groups = roomGroups(ITEMS);
    expect(groups[0].room?.id).toBe('r1');
    expect(groups[0].items.map((i) => i.id)).toContain('s1');
    const summary = reviewSummary(ITEMS, 80, { w1: 'accepted', r1: 'accepted', s1: 'accepted' });
    expect(summary.accepted).toEqual({ walls: 1, windows: 0, doors: 0, rooms: 1, fixtures: 0 });
  });

  it('Finish import makes no object of the slope; a rising slope sets its room to single slope', () => {
    const decisions = { w1: 'accepted', r1: 'accepted', s1: 'accepted' } as const;
    const accepted = finishItems(ITEMS, decisions, { s1: fixes.points });
    expect(accepted.map((i) => i.id)).toEqual(['w1', 'r1', 's1']);
    let n = 0;
    const built = importObjects(accepted, {}, {
      level: '00000000-0000-4000-8000-000000000001',
      appUserId: '00000000-0000-4000-8000-000000000002',
      now: '2026-11-17T12:00:00.000Z',
      firstRoomNumber: 1,
      newId: () => `00000000-0000-4000-8000-00000000010${(n += 1)}`,
    });
    expect(built?.objects.map((o) => o.type)).toEqual(['wall', 'room']);
    const room = built?.objects[1].data as { attributes: { ceilingType: string | null } };
    expect(room.attributes.ceilingType).toBe('single_slope');
    expect(importedCounts(accepted)).toEqual({ walls: 1, windows: 0, doors: 0, rooms: 1 });

    // A flat reading (pitch 0) leaves the room's ceiling type unset.
    const flat = finishItems(ITEMS, decisions, {
      s1: { input: 'points', lowHeight: 96, highHeight: 96, pitchPer12: 0 },
    });
    const flatBuilt = importObjects(flat, {}, {
      level: '00000000-0000-4000-8000-000000000001',
      appUserId: '00000000-0000-4000-8000-000000000002',
      now: '2026-11-17T12:00:00.000Z',
      firstRoomNumber: 1,
      newId: () => `00000000-0000-4000-8000-00000000020${(n += 1)}`,
    });
    const flatRoom = flatBuilt?.objects[1].data as { attributes: { ceilingType: string | null } };
    expect(flatRoom.attributes.ceilingType).toBeNull();
  });
});
