// EZD-302 AC-EZD-302-1 and AC-EZD-302-2 (phase-03 EZD-302 Done when; 08 Imports Polycam Space scan; S02 Data
// shown "confidence %"). Expected values come from the hand-written fixture JSON (fixtures/synthetic/
// room-12x10.dxf.expected.json `semantic`, `roomPolygon`; room-12x10-unjoined.dxf.expected.json), never from a run.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectPolycamDxf, layerMapFromNames, type DetectedWall, type Detection } from './detect';
import { DxfReadError, readDxf } from './read-dxf';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
);
const fixture = (rel: string) => path.join(repo, rel);
const json = (rel: string) => JSON.parse(readFileSync(fixture(rel), 'utf8'));

const CLEAN = 'fixtures/synthetic/room-12x10.dxf';
const UNJOINED = 'fixtures/synthetic/room-12x10-unjoined.dxf';

const detectFile = (rel: string): Detection =>
  detectPolycamDxf(readDxf(new Uint8Array(readFileSync(fixture(rel)))));

const SIDE: Record<string, DetectedWall['side']> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const wallLength = (w: DetectedWall) =>
  Math.hypot(w.geometry.end.x - w.geometry.start.x, w.geometry.end.y - w.geometry.start.y);

describe('EZD-302 Polycam DXF detection', () => {
  const clean = json(`${CLEAN}.expected.json`);
  const unjoined = json(`${UNJOINED}.expected.json`);
  const tol = clean.tolerances.lengthIn as number;

  it('maps the fixture layers to walls, doors, windows and rooms by name', () => {
    expect(layerMapFromNames(clean.layers)).toEqual({
      walls: ['WALLS'],
      doors: ['DOORS'],
      windows: ['WINDOWS'],
      rooms: ['ROOMS'],
    });
  });

  it('the synthetic room gives its four walls, the door, the window and the room', () => {
    const d = detectFile(CLEAN);
    expect(d.walls).toHaveLength(clean.semantic.walls.length);
    for (const w of clean.semantic.walls) {
      const found = d.walls.filter((x) => x.side === SIDE[w.side]);
      expect(found, w.side).toHaveLength(1);
      expect(wallLength(found[0])).toBeCloseTo(w.interiorLengthIn, 3);
      expect(Math.abs(found[0].thickness! - w.thicknessIn)).toBeLessThanOrEqual(tol);
      expect(found[0].joinedEnds, w.side).toBe(2);
    }
    const south = d.walls.find((x) => x.side === 'south')!;
    const door = d.openings.filter((o) => o.kind === 'door');
    const win = d.openings.filter((o) => o.kind === 'window');
    expect(door).toHaveLength(1);
    expect(win).toHaveLength(1);
    expect(door[0].hostWallId).toBe(south.id);
    expect(Math.abs(door[0].offset! - clean.semantic.door.offsetIn)).toBeLessThanOrEqual(tol);
    expect(Math.abs(door[0].width - clean.semantic.door.widthIn)).toBeLessThanOrEqual(tol);
    expect(door[0].hinge).toEqual({
      x: clean.semantic.door.hinge[0],
      y: clean.semantic.door.hinge[1],
    });
    expect(win[0].hostWallId).toBe(south.id);
    expect(Math.abs(win[0].offset! - clean.semantic.window.offsetIn)).toBeLessThanOrEqual(tol);
    expect(Math.abs(win[0].width - clean.semantic.window.widthIn)).toBeLessThanOrEqual(tol);
    expect(d.rooms).toHaveLength(1);
    expect(d.rooms[0].closed).toBe(true);
    expect(Math.abs(d.rooms[0].areaSqIn - clean.roomPolygon.areaSqIn)).toBeLessThanOrEqual(
      clean.tolerances.areaSqIn,
    );
  });

  it('every wall of the synthetic room is drawn on its inside face with the thickness on the right', () => {
    // EZD-202 Wall line: start to end is the inside finished face; the room interior is 0..144 x 0..120.
    for (const w of detectFile(CLEAN).walls) {
      for (const p of [w.geometry.start, w.geometry.end]) {
        expect(p.x).toBeGreaterThanOrEqual(-tol);
        expect(p.x).toBeLessThanOrEqual(clean.roomPolygon.vertices[1][0] + tol);
        expect(p.y).toBeGreaterThanOrEqual(-tol);
        expect(p.y).toBeLessThanOrEqual(clean.roomPolygon.vertices[2][1] + tol);
      }
      expect(w.thicknessSide).toBe('right');
    }
  });

  it('every item carries a confidence from 0 to 100', () => {
    const d = detectFile(CLEAN);
    for (const item of [...d.walls, ...d.openings, ...d.rooms]) {
      expect(Number.isInteger(item.confidence)).toBe(true);
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('AC-EZD-302-1 the fixture with one unjoined wall scores that wall below the others', () => {
    const d = detectFile(UNJOINED);
    expect(d.walls).toHaveLength(unjoined.semantic.walls.length);
    const bySide = (s: string) => d.walls.find((w) => w.side === SIDE[s])!;
    for (const w of unjoined.semantic.walls) {
      expect(wallLength(bySide(w.side))).toBeCloseTo(w.interiorLengthIn, 3);
      expect(bySide(w.side).joinedEnds, w.side).toBe(w.joinedEnds);
    }
    const loose = bySide(unjoined.semantic.unjoinedWall);
    for (const other of d.walls.filter((w) => w.id !== loose.id)) {
      expect(loose.confidence, other.side).toBeLessThan(other.confidence);
    }
  });

  it('AC-EZD-302-1 the gap is beyond the join tolerance, and a tolerance wider than the gap joins it', () => {
    expect(unjoined.change.gapIn).toBeGreaterThan(unjoined.tolerances.joinIn);
    const drawing = readDxf(new Uint8Array(readFileSync(fixture(UNJOINED))));
    const wide = detectPolycamDxf(drawing, { toleranceIn: unjoined.change.gapIn + 0.5 });
    expect(wide.walls.every((w) => w.joinedEnds === 2)).toBe(true);
  });

  const realDir = fixture('fixtures/real/polycam-dxf');
  const realEntry = (json('fixtures/manifest.json') as { id: string; status: string }[]).find(
    (e) => e.id === 'polycam-dxf',
  )!;
  const realFiles =
    realEntry.status === 'present' && existsSync(realDir)
      ? readdirSync(realDir).filter((f) => f.toLowerCase().endsWith('.dxf'))
      : [];

  // Runs once Josh supplies the real file (fixtures/manifest.json polycam-dxf "not yet supplied").
  it.skipIf(realFiles.length === 0)(
    'AC-EZD-302-2 the real Polycam fixture yields walls, openings and rooms with confidence values',
    () => {
      for (const f of realFiles) {
        const d = detectPolycamDxf(readDxf(new Uint8Array(readFileSync(path.join(realDir, f)))));
        expect(d.walls.length, f).toBeGreaterThan(0);
        expect(d.openings.length, f).toBeGreaterThan(0);
        expect(d.rooms.length, f).toBeGreaterThan(0);
        for (const item of [...d.walls, ...d.openings, ...d.rooms]) {
          expect(item.confidence).toBeGreaterThanOrEqual(0);
          expect(item.confidence).toBeLessThanOrEqual(100);
        }
      }
    },
  );
});

describe('EZD-302 reading a DXF', () => {
  it('refuses a binary DXF and text the parser cannot read', () => {
    const binary = new TextEncoder().encode('AutoCAD Binary DXF\r\n\x1a\x00');
    expect(() => readDxf(binary)).toThrow(DxfReadError);
    expect(() => readDxf(binary)).toThrow('binary_dxf');
  });

  it('converts $INSUNITS 2 (feet) to inches', () => {
    const text = [
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$ACADVER',
      '1',
      'AC1009',
      '9',
      '$INSUNITS',
      '70',
      '2',
      '0',
      'ENDSEC',
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LINE',
      '8',
      'WALLS',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '11',
      '1',
      '21',
      '0',
      '31',
      '0',
      '0',
      'ENDSEC',
      '0',
      'EOF',
      '',
    ].join('\r\n');
    const d = readDxf(new TextEncoder().encode(text));
    expect(d.lines).toEqual([{ layer: 'WALLS', a: { x: 0, y: 0 }, b: { x: 12, y: 0 } }]);
  });
});
