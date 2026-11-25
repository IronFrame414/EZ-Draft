// EZD-503 the ceiling type editor's logic (AC-EZD-503-1 "Read heights from scan fills the slope from the mesh."; S05
// Controls "Room ceiling summary ... (e.g. "walls 8' 0" · ridge 13' 0" · 9.4/12")", "Change ceiling ... type, heights
// per wall or per point, or pitch, or read from Polycam mesh. ... Heights accept typed formats (12'6", 12' 6 1/2",
// 150", 12.5')."; S05 States "Empty: room has no ceiling set; default is flat at the wall height"; S05 Validation
// "Typed heights: invalid format shows inline error, value not applied"; board S05Ceiling "Vaulted, ridge
// east-west").
// Expected values: the scan numbers come from fixtures/synthetic/room-12x10-sloped.glb.expected.json (144" x 120"
// room, west wall 96", east wall 144", 4/12, high wall E); the summary from the board's "walls 8' 0" · ridge 13' 0" ·
// 9.4/12"; vaulted pitch = 12 x rise / half span (S05 "pitch (n/12)"; vault/build/assumptions.md EZD-503).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  newRoomAttributes,
  roomDataSchema,
  type Point,
  type RoomCeiling,
} from '@ezdraft/geometry';
import { ceilingMesh, type CeilingMesh } from '../../lib/imports/polycam-glb/ceiling';
import { readGlb } from '../../lib/imports/polycam-glb/read-glb';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyChanges, F1, ROOM, uid } from '../tools/test-utils/fixtures';
import {
  activeRoomId,
  ceilingDraft,
  ceilingSummary,
  createScanGate,
  fillFromScan,
  formatPitch,
  parseHeight,
  parsePitch,
  saveCeiling,
  summaryHeights,
} from './room-ceiling';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GLB = 'fixtures/synthetic/room-12x10-sloped.glb';
const expected = JSON.parse(readFileSync(path.join(repo, `${GLB}.expected.json`), 'utf8')) as {
  tolerances: { inches: number; pitchPer12: number };
  ceiling: {
    cornerHeightsIn: Record<'SW' | 'NW' | 'SE' | 'NE', { at: [number, number]; heightIn: number }>;
    lowWall: { side: string; heightIn: number };
    highWall: { side: string; heightIn: number };
    pitchPer12: number;
  };
};

const P = (x: number, y: number): Point => ({ x, y });
const RID = uid(60);
const WORDS = { walls: 'walls', ridge: 'ridge' };

function room(
  boundary: Point[],
  name = 'Family room',
  ceilingType: string | null = null,
  ceiling: RoomCeiling | null = null,
): ObjectValue {
  return {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary },
      status: 'existing',
      level: F1,
      attributes: { ...newRoomAttributes(name), ceilingType, ceiling },
      closureOverride: null,
    },
  };
}

/** ROOM's four 96" walls around a 144" x 120" room (tools fixtures), the room from the GLB fixture's plan. */
function scanRoom(): Map<string, ObjectValue> {
  const o = new Map(ROOM);
  o.set(RID, room([P(0, 0), P(144, 0), P(144, 120), P(0, 120)]));
  return o;
}

const storedCeiling = (objects: ReadonlyMap<string, ObjectValue>) => {
  const d = roomDataSchema.parse(objects.get(RID)!.data);
  return { type: d.attributes.ceilingType, ceiling: d.attributes.ceiling };
};

describe('AC-EZD-503-1 Read heights from scan fills the slope from the mesh', () => {
  const glb = readGlb(new Uint8Array(readFileSync(path.join(repo, GLB))));
  const mesh = ceilingMesh(glb);
  const c = expected.ceiling;
  const tol = expected.tolerances;

  it('fills each corner height, the high side and the slope from the fixture mesh', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    expect(draft.type).toBe('flat');
    const filled = fillFromScan(draft, mesh);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(filled.draft.type).toBe('single_slope');
    expect(filled.draft.heightsBy).toBe('point');
    expect(filled.draft.highSide).toBe(c.highWall.side);
    // Boundary order SW, SE, NE, NW.
    const want = [
      c.cornerHeightsIn.SW,
      c.cornerHeightsIn.SE,
      c.cornerHeightsIn.NE,
      c.cornerHeightsIn.NW,
    ];
    filled.draft.points.forEach((p, i) => {
      expect([p.at.x, p.at.y]).toEqual(want[i]!.at);
      expect(Math.abs(parseHeight(p.text)! - want[i]!.heightIn)).toBeLessThanOrEqual(tol.inches);
    });
    expect(
      Math.abs(parseHeight(filled.draft.ridgeText)! - c.highWall.heightIn),
    ).toBeLessThanOrEqual(tol.inches);
  });

  it('Save stores the filled slope: point heights, pitch 4/12 and the high edge on the east wall', () => {
    const objects = scanRoom();
    const filled = fillFromScan(ceilingDraft(objects, RID)!, mesh);
    if (!filled.ok) throw new Error('scan refused');
    const r = saveCeiling(objects, RID, filled.draft);
    expect(r.ok).toBe(true);
    if (!r.ok || r.change === null) throw new Error('no change');
    const { type, ceiling } = storedCeiling(applyChanges(objects, [r.change]));
    expect(type).toBe('single_slope');
    expect(ceiling!.heightsBy).toBe('point');
    expect(ceiling!.pointHeights.map((p) => p.height)).toEqual([
      c.cornerHeightsIn.SW.heightIn,
      c.cornerHeightsIn.SE.heightIn,
      c.cornerHeightsIn.NE.heightIn,
      c.cornerHeightsIn.NW.heightIn,
    ]);
    expect(Math.abs(ceiling!.pitch! - c.pitchPer12)).toBeLessThanOrEqual(tol.pitchPer12);
    expect(ceiling!.ridge).toEqual({
      start: P(144, 0),
      end: P(144, 120),
      height: c.highWall.heightIn,
    });
    expect(summaryHeights(ceilingSummary(applyChanges(objects, [r.change]), RID)!, WORDS)).toBe(
      `walls 8' 0" · ridge 12' 0" · 4/12`,
    );
  });

  it('refuses a mesh with no ceiling and a room the mesh does not cover', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    expect(fillFromScan(draft, null)).toEqual({ ok: false, reason: 'no_ceiling' });
    const away = {
      ...draft,
      points: draft.points.map((p) => ({ ...p, at: P(p.at.x + 1000, p.at.y) })),
    };
    expect(fillFromScan(away, mesh)).toEqual({ ok: false, reason: 'not_covered' });
  });
});

describe('EZD-503 typed heights (S05 "12\'6", 12\' 6 1/2", 150", 12.5\'")', () => {
  it('reads each format S05 names', () => {
    expect(parseHeight(`12'6"`)).toBe(150);
    expect(parseHeight(`12' 6 1/2"`)).toBe(150.5);
    expect(parseHeight(`150"`)).toBe(150);
    expect(parseHeight(`12.5'`)).toBe(150);
  });
  it("refuses other text, 0 and a height over 200'", () => {
    expect(parseHeight('tall')).toBeNull();
    expect(parseHeight('0')).toBeNull();
    expect(parseHeight(`201'`)).toBeNull();
  });
  it('reads a pitch as n or n/12, above 0 and up to 24/12', () => {
    expect(parsePitch('9.4')).toBe(9.4);
    expect(parsePitch('4/12')).toBe(4);
    expect(parsePitch('0')).toBeNull();
    expect(parsePitch('25')).toBeNull();
    expect(parsePitch('steep')).toBeNull();
  });
  it('an invalid height shows its error and nothing is applied', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    const bad = {
      ...draft,
      walls: draft.walls.map((w, i) => (i === 1 ? { ...w, text: '8 feet' } : w)),
    };
    expect(saveCeiling(objects, RID, bad)).toEqual({ ok: false, errors: { 'wall:1': 'format' } });
  });
});

describe('EZD-503 room ceiling summary', () => {
  it('board S05Ceiling: a vaulted room reads "Vaulted, ridge east-west" and walls 8\' 0" · ridge 13\' 0" · 9.4/12', () => {
    const objects = new Map(ROOM);
    // EZD-501 test values: ridge (0,96) to (240,96) at 156", pitch 9.4, walls 96" per wall.
    objects.set(
      RID,
      room([P(0, 0), P(240, 0), P(240, 192), P(0, 192)], 'Family room', 'vaulted', {
        heightsBy: 'wall',
        wallHeights: [{ wall: uid(1), height: 96 }],
        pointHeights: [],
        pitch: 9.4,
        ridge: { start: P(0, 96), end: P(240, 96), height: 156 },
      }),
    );
    const s = ceilingSummary(objects, RID)!;
    expect(s.name).toBe('Family room');
    expect(s.type).toBe('vaulted');
    expect(s.ridgeDirection).toBe('east_west');
    expect(summaryHeights(s, WORDS)).toBe(`walls 8' 0" · ridge 13' 0" · 9.4/12`);
  });

  it("S05 Empty: a room with no ceiling is flat at its walls' height, no ridge and no pitch", () => {
    const s = ceilingSummary(scanRoom(), RID)!;
    expect(s).toMatchObject({
      type: 'flat',
      ridgeDirection: null,
      ridgeIn: null,
      pitch: null,
      wallsIn: 96,
    });
    expect(summaryHeights(s, WORDS)).toBe(`walls 8' 0"`);
  });

  it('writes pitch to one decimal and a whole pitch without one', () => {
    expect(formatPitch(9.4)).toBe('9.4/12');
    expect(formatPitch(4)).toBe('4/12');
    expect(formatPitch(7.5)).toBe('7.5/12');
  });

  it("the active room is the selected room, else a selected beam set's room, else the floor's first room", () => {
    const objects = scanRoom();
    const other = uid(61);
    objects.set(other, room([P(200, 0), P(300, 0), P(300, 100), P(200, 100)], 'Laundry'));
    expect(activeRoomId(objects, F1, [])).toBe(RID);
    expect(activeRoomId(objects, F1, [other])).toBe(other);
    objects.set(uid(70), {
      type: 'beam',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { geometry: { roomId: other } } as unknown as Record<string, unknown>,
    });
    expect(activeRoomId(objects, F1, [uid(70)])).toBe(other);
    expect(activeRoomId(new Map(ROOM), F1, [])).toBeNull();
  });
});

describe('EZD-503 Change ceiling saves type, heights per wall or point, or pitch', () => {
  // A 240" x 192" room, walls 96": a vaulted ridge east-west through y = 96, half span 96".
  function vaultRoom(): Map<string, ObjectValue> {
    const o = new Map(ROOM);
    o.set(RID, room([P(0, 0), P(240, 0), P(240, 192), P(0, 192)]));
    return o;
  }

  it('vaulted by wall: walls 8\' 0", ridge 13\' 0" east-west gives pitch 12 x 60 / 96 = 7.5', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    expect(draft.walls).toHaveLength(4);
    expect(draft.walls.every((w) => w.text === `8' 0"`)).toBe(true);
    const v = vaultRoom();
    const vd = ceilingDraft(v, RID)!;
    const r = saveCeiling(v, RID, {
      ...vd,
      type: 'vaulted',
      heightsBy: 'point',
      points: vd.points.map((p) => ({ ...p, text: `8' 0"` })),
      ridgeText: `13' 0"`,
      ridgeDirection: 'east_west',
    });
    if (!r.ok || r.change === null) throw new Error('refused');
    const { type, ceiling } = storedCeiling(applyChanges(v, [r.change]));
    expect(type).toBe('vaulted');
    expect(ceiling!.pitch).toBe(7.5);
    expect(ceiling!.ridge).toEqual({ start: P(0, 96), end: P(240, 96), height: 156 });
    expect(ceiling!.pointHeights.map((p) => p.height)).toEqual([96, 96, 96, 96]);
  });

  it('by wall stores one height per wall around the room', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    const r = saveCeiling(objects, RID, {
      ...draft,
      walls: draft.walls.map((w) => ({ ...w, text: `9' 0"` })),
    });
    if (!r.ok || r.change === null) throw new Error('refused');
    const { type, ceiling } = storedCeiling(applyChanges(objects, [r.change]));
    expect(type).toBe('flat');
    expect(ceiling).toEqual({
      heightsBy: 'wall',
      wallHeights: [uid(1), uid(2), uid(3), uid(4)].map((wall) => ({ wall, height: 108 })),
      pointHeights: [],
      pitch: null,
      ridge: null,
    });
  });

  it('by pitch: north-south vault at 6/12 over the walls\' 96" rises 6 x 120 / 12 = 60 to a 156" ridge', () => {
    const v = vaultRoom();
    const r = saveCeiling(v, RID, {
      ...ceilingDraft(v, RID)!,
      type: 'vaulted',
      heightsBy: 'pitch',
      pitchText: '6/12',
      ridgeDirection: 'north_south',
    });
    if (!r.ok || r.change === null) throw new Error('refused');
    const { ceiling } = storedCeiling(applyChanges(v, [r.change]));
    expect(ceiling!.heightsBy).toBe('pitch');
    expect(ceiling!.pitch).toBe(6);
    expect(ceiling!.ridge).toEqual({ start: P(120, 0), end: P(120, 192), height: 156 });
  });

  it('a ridge at or below the walls is refused', () => {
    const v = vaultRoom();
    const r = saveCeiling(v, RID, {
      ...ceilingDraft(v, RID)!,
      type: 'vaulted',
      heightsBy: 'point',
      ridgeText: `8' 0"`,
    });
    expect(r).toEqual({ ok: false, errors: { ridge: 'ridge_low' } });
  });

  it('the draft reads back what Save stored', () => {
    const v = vaultRoom();
    const first = saveCeiling(v, RID, {
      ...ceilingDraft(v, RID)!,
      type: 'single_slope',
      heightsBy: 'pitch',
      pitchText: '4',
      highSide: 'E',
    });
    if (!first.ok || first.change === null) throw new Error('refused');
    const after = applyChanges(v, [first.change]);
    const back = ceilingDraft(after, RID)!;
    expect(back).toMatchObject({
      type: 'single_slope',
      heightsBy: 'pitch',
      pitchText: '4',
      highSide: 'E',
    });
    expect(saveCeiling(after, RID, back)).toEqual({ ok: true, change: null });
  });
});

// Reviewer finding: a scan can hold several rooms, so the slope is read inside the active room only. Hand-made mesh in
// plan inches: room A (x 0..144, y 0..120) level at 96"; room B (x 150..294, y 0..120) rising north from 96" at y = 0
// to 136" at y = 120, which is 12 x 40 / 120 = 4/12 with the high side north.
describe('EZD-503 Read heights from scan on a two-room scan', () => {
  const quad = (x0: number, x1: number, hS: number, hN: number) => [
    ...[x0, 0, hS, x1, 0, hS, x1, 120, hN],
    ...[x0, 0, hS, x1, 120, hN, x0, 120, hN],
  ];
  const mesh: CeilingMesh = {
    triangles: new Float64Array([...quad(0, 144, 96, 96), ...quad(150, 294, 96, 136)]),
    triangleCount: 4,
  };
  const B = uid(61);
  function twoRooms(): Map<string, ObjectValue> {
    const o = scanRoom();
    o.set(B, room([P(150, 0), P(294, 0), P(294, 120), P(150, 120)], 'Den'));
    return o;
  }

  it('the flat room stays flat beside a sloped one', () => {
    const filled = fillFromScan(ceilingDraft(twoRooms(), RID)!, mesh);
    if (!filled.ok) throw new Error('refused');
    expect(filled.draft.type).toBe('flat');
    expect(filled.draft.ridgeText).toBe('');
    expect(filled.draft.points.map((p) => parseHeight(p.text))).toEqual([96, 96, 96, 96]);
  });

  it('the sloped room gets its own high side and pitch', () => {
    const objects = twoRooms();
    const filled = fillFromScan(ceilingDraft(objects, B)!, mesh);
    if (!filled.ok) throw new Error('refused');
    expect(filled.draft).toMatchObject({
      type: 'single_slope',
      highSide: 'N',
      ridgeText: `11' 4"`,
    });
    const r = saveCeiling(objects, B, filled.draft);
    if (!r.ok || r.change === null) throw new Error('no change');
    const d = roomDataSchema.parse(applyChanges(objects, [r.change]).get(B)!.data);
    expect(d.attributes.ceiling!.pitch).toBe(4);
    expect(d.attributes.ceiling!.ridge).toEqual({
      start: P(150, 120),
      end: P(294, 120),
      height: 136,
    });
  });

  it('corner heights within 1" read as flat, not as a slope', () => {
    const tilted: CeilingMesh = {
      triangles: new Float64Array(quad(0, 144, 96, 96.5)),
      triangleCount: 2,
    };
    const filled = fillFromScan(ceilingDraft(scanRoom(), RID)!, tilted);
    expect(filled.ok && filled.draft.type).toBe('flat');
  });
});

// Reviewer finding: a scan result belongs to the editor that asked for it.
describe('EZD-503 scan gate', () => {
  it('accepts the result only for the same room, with the editor not closed or reopened since', () => {
    const gate = createScanGate();
    gate.reset(); // room A's editor opens
    const a = gate.ask(RID);
    expect(gate.accepts(a, RID)).toBe(true);
    expect(gate.accepts(a, RID.toUpperCase())).toBe(true);
    expect(gate.accepts(a, uid(61))).toBe(false);
    expect(gate.accepts(a, null)).toBe(false);
    gate.reset(); // room B's editor opens before the download ends
    expect(gate.accepts(a, uid(61))).toBe(false);
    expect(gate.accepts(a, RID)).toBe(false);
    // A second press replaces the first.
    const b1 = gate.ask(uid(61));
    const b2 = gate.ask(uid(61));
    expect(gate.accepts(b1, uid(61))).toBe(false);
    expect(gate.accepts(b2, uid(61))).toBe(true);
  });
});

// Reviewer finding: a vaulted scan has level corners, so the vault is read from the middle of the room. Hand-made
// mesh over the 144" x 120" room: 96" at the south (y = 0) and north (y = 120) walls, 126" along y = 60. Worked
// example: rise 126 - 96 = 30 over the half span 60 is 12 x 30 / 60 = 6/12, ridge east-west at 10' 6".
describe('EZD-503 Read heights from scan on a vaulted scan', () => {
  const half = (y0: number, y1: number, h0: number, h1: number) => [
    ...[0, y0, h0, 144, y0, h0, 144, y1, h1],
    ...[0, y0, h0, 144, y1, h1, 0, y1, h1],
  ];
  const mesh: CeilingMesh = {
    triangles: new Float64Array([...half(0, 60, 96, 126), ...half(60, 120, 126, 96)]),
    triangleCount: 4,
  };

  it('a flat draft becomes vaulted with the ridge and pitch from the mesh', () => {
    const objects = scanRoom();
    const draft = ceilingDraft(objects, RID)!;
    expect(draft.type).toBe('flat');
    const filled = fillFromScan(draft, mesh);
    if (!filled.ok) throw new Error('refused');
    expect(filled.draft).toMatchObject({
      type: 'vaulted',
      heightsBy: 'point',
      ridgeDirection: 'east_west',
      ridgeText: `10' 6"`,
    });
    expect(filled.draft.points.map((p) => parseHeight(p.text))).toEqual([96, 96, 96, 96]);
    const r = saveCeiling(objects, RID, filled.draft);
    if (!r.ok || r.change === null) throw new Error('no change');
    const after = applyChanges(objects, [r.change]);
    const { type, ceiling } = storedCeiling(after);
    expect(type).toBe('vaulted');
    expect(ceiling!.pitch).toBe(6);
    expect(ceiling!.ridge).toEqual({ start: P(0, 60), end: P(144, 60), height: 126 });
    expect(summaryHeights(ceilingSummary(after, RID)!, WORDS)).toBe(
      `walls 8' 0" · ridge 10' 6" · 6/12`,
    );
  });

  it('a single-slope draft becomes vaulted too', () => {
    const draft = { ...ceilingDraft(scanRoom(), RID)!, type: 'single_slope' as const };
    const filled = fillFromScan(draft, mesh);
    expect(filled.ok && filled.draft.type).toBe('vaulted');
  });
});

// Reviewer finding: by pitch, the plate is the walls' own height, not an earlier by-wall save's ceiling heights.
// Worked example: 96" walls, north-south vault over the 144" span (run 72) at 6/12 rises 6 x 72 / 12 = 36 to 132".
describe('EZD-503 switching a by-wall room to pitch', () => {
  it("the ridge, pitch and summary agree on the walls' 8' 0\"", () => {
    const objects = scanRoom();
    const first = saveCeiling(objects, RID, {
      ...ceilingDraft(objects, RID)!,
      walls: ceilingDraft(objects, RID)!.walls.map((w) => ({ ...w, text: `10' 0"` })),
    });
    if (!first.ok || first.change === null) throw new Error('refused');
    const byWall = applyChanges(objects, [first.change]);
    expect(summaryHeights(ceilingSummary(byWall, RID)!, WORDS)).toBe(`walls 10' 0"`);
    const r = saveCeiling(byWall, RID, {
      ...ceilingDraft(byWall, RID)!,
      type: 'vaulted',
      heightsBy: 'pitch',
      pitchText: '6',
      ridgeDirection: 'north_south',
    });
    if (!r.ok || r.change === null) throw new Error('refused');
    const after = applyChanges(byWall, [r.change]);
    const { ceiling } = storedCeiling(after);
    expect(ceiling!.wallHeights).toEqual([]);
    expect(ceiling!.ridge!.height).toBe(132);
    expect(summaryHeights(ceilingSummary(after, RID)!, WORDS)).toBe(
      `walls 8' 0" · ridge 11' 0" · 6/12`,
    );
  });
});
