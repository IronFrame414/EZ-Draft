// EZD-1915 (AC-EZD-1915-1; editor plan 2.5 "Inspector (right) branches, in order", 5.3 "inspector/kinds/", R13):
// each inspector branch is a registered kind, chosen in the order 2.5 lists; Wall, Opening and Bulk panels and the
// shared fields are their own files; InspectorPanel.tsx is under 300 lines; the ceiling inspector panels left tools/.
// Which branch a real selection shows is proved by editor/contract/editor-contract.test.tsx (AC-EZD-1901-1).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectorKinds } from './registry';
import type { InspectorKindContext } from './types';

const KINDS_DIR = __dirname;
const INSPECTOR_DIR = path.resolve(KINDS_DIR, '..');
const TOOLS_DIR = path.resolve(INSPECTOR_DIR, '..', 'tools');

// Editor plan 2.5, in its order: Room alone, Pin, Beam set, ACT grid, Switching zone, Device, Engineer note,
// otherwise wall / opening / bulk.
const ORDER_2_5 = [
  'room',
  'pin',
  'beam',
  'act_grid',
  'switch_zone',
  'device',
  'engineer_note',
  'wall_opening_bulk',
];

describe('EZD-1915 inspector kinds', () => {
  it('AC-EZD-1915-1 registers every branch of section 2.5, in its order', () => {
    expect(inspectorKinds.map((k) => k.id)).toEqual(ORDER_2_5);
  });

  it('AC-EZD-1915-1 gives each kind its own order number', () => {
    const orders = inspectorKinds.map((k) => k.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('AC-EZD-1915-1 picks the first kind that names the selection', () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    const typed = (type: string): InspectorKindContext =>
      ({
        objects: new Map([[id, { type, schemaVersion: 1, data: {} }]]),
        selectedIds: [id],
        ids: [id],
        idsKey: id,
      }) as unknown as InspectorKindContext;
    const first = (ctx: InspectorKindContext) =>
      inspectorKinds.find((k) => k.match(ctx) !== null)?.id;
    expect(first(typed('pin'))).toBe('pin');
    expect(first(typed('beam'))).toBe('beam');
    expect(first(typed('act_grid'))).toBe('act_grid');
    expect(first(typed('switch_zone'))).toBe('switch_zone');
    expect(first(typed('device'))).toBe('device');
    expect(first(typed('engineer_note'))).toBe('engineer_note');
    expect(first(typed('wall'))).toBe('wall_opening_bulk');
    // Two objects of a single-object kind are the bulk view, never that kind's panel.
    const two = { ...typed('beam'), ids: [id, id], selectedIds: [id, id], idsKey: `${id} ${id}` };
    expect(first(two)).toBe('wall_opening_bulk');
  });

  it('AC-EZD-1915-1 keeps the Wall, Opening and Bulk panels and the shared fields in their own files', () => {
    for (const f of ['WallPanel.tsx', 'OpeningPanel.tsx', 'BulkPanel.tsx', 'SharedFields.tsx'])
      expect(fs.existsSync(path.join(KINDS_DIR, f)), f).toBe(true);
    expect(fs.readFileSync(path.join(KINDS_DIR, 'WallPanel.tsx'), 'utf8')).toMatch(
      /export function WallPanel\(/,
    );
    expect(fs.readFileSync(path.join(KINDS_DIR, 'OpeningPanel.tsx'), 'utf8')).toMatch(
      /export function OpeningPanel\(/,
    );
    expect(fs.readFileSync(path.join(KINDS_DIR, 'BulkPanel.tsx'), 'utf8')).toMatch(
      /export function BulkPanel\(/,
    );
  });

  it('AC-EZD-1915-1 keeps InspectorPanel.tsx under 300 lines', () => {
    const text = fs.readFileSync(path.join(INSPECTOR_DIR, 'InspectorPanel.tsx'), 'utf8');
    expect(text.split('\n').length).toBeLessThan(300);
  });

  // AC-EZD-1915-2: the inspector, beam, ACT grid, switching zone, device, pin and engineer note tests pass with only
  // import-path changes. They run in this suite; here: the panels they import are at the new paths, and no test
  // still imports one from tools/.
  it('AC-EZD-1915-2 moves the ceiling inspector panels from tools/ to inspector/kinds/ (editor plan R13)', () => {
    for (const f of [
      'BeamPanel.tsx',
      'ActGridPanel.tsx',
      'DevicePanel.tsx',
      'SwitchZonePanel.tsx',
    ]) {
      expect(fs.existsSync(path.join(KINDS_DIR, f)), f).toBe(true);
      expect(fs.existsSync(path.join(TOOLS_DIR, f)), `tools/${f}`).toBe(false);
    }
    const oldImport =
      /from '(\.|\.\.\/tools)\/(BeamPanel|ActGridPanel|DevicePanel|SwitchZonePanel)'/;
    for (const f of fs.readdirSync(TOOLS_DIR).filter((n) => /\.test\.tsx?$/.test(n)))
      expect(oldImport.test(fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8')), f).toBe(false);
  });
});
