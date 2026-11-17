// EZD-306 (S01 DXF: conversion choice; S02 Decisions "lists only items from the layers chosen for conversion").
// Expected values: the synthetic room's entity layers (fixtures/synthetic/room-12x10.dxf.expected.json
// `entitiesByLayer`: WALLS, DOORS, WINDOWS, ROOMS; layer 0 holds no entity) and its one door (`semantic.door`).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectPolycamDxf } from './detect';
import { layerMapFromChoice, listDxfLayers } from './layer-choice';
import { DxfReadError, readDxf } from './read-dxf';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const CLEAN = path.join(repo, 'fixtures/synthetic/room-12x10.dxf');
const expected = JSON.parse(readFileSync(`${CLEAN}.expected.json`, 'utf8'));
const bytes = new Uint8Array(readFileSync(CLEAN));

describe('EZD-306 DXF layer list and choice', () => {
  it('lists the layers that hold entities, sorted, without parsing', () => {
    expect(listDxfLayers(bytes)).toEqual(Object.keys(expected.entitiesByLayer).sort());
    expect(listDxfLayers(bytes)).toEqual(readDxf(bytes).layers);
  });

  it('a binary DXF is refused with its code', () => {
    expect(() => listDxfLayers(new TextEncoder().encode('AutoCAD Binary DXF\r\n'))).toThrow(
      DxfReadError,
    );
  });

  it('two chosen layers give items only from those layers', () => {
    const map = layerMapFromChoice([
      { name: 'WALLS', role: 'walls' },
      { name: 'DOORS', role: 'doors' },
    ]);
    expect(map).toEqual({ walls: ['WALLS'], doors: ['DOORS'], windows: [], rooms: [] });
    const d = detectPolycamDxf(readDxf(bytes), { layerMap: map });
    expect(d.walls.length).toBeGreaterThan(0);
    expect(d.walls.every((w) => w.layer === 'WALLS')).toBe(true);
    expect(d.openings.map((o) => [o.kind, o.layer, o.width])).toEqual([
      ['door', 'DOORS', expected.semantic.door.widthIn],
    ]);
    expect(d.rooms).toEqual([]);
  });

  // A door is a door-layer arc (detect.ts); WINDOWS holds 3 lines and no arc (`entitiesByLayer`), so read as doors
  // it gives no opening, and read as windows it gives the one window.
  it('the role decides how a layer is read, whatever its name', () => {
    const asDoors = detectPolycamDxf(readDxf(bytes), {
      layerMap: layerMapFromChoice([{ name: 'WINDOWS', role: 'doors' }]),
    });
    expect(asDoors.walls).toEqual([]);
    expect(asDoors.openings).toEqual([]);
    const asWindows = detectPolycamDxf(readDxf(bytes), {
      layerMap: layerMapFromChoice([{ name: 'WINDOWS', role: 'windows' }]),
    });
    expect(asWindows.openings.map((o) => o.kind)).toEqual(['window']);
  });
});
