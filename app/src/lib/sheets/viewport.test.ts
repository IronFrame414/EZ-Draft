// EZD-703 (S13 Rail: Viewport; 09h "Scales per viewport: 1/4\" = 1'-0\" plans, 1/2\" = 1'-0\" elevations; details true
// scale or NTS"; 09h numbering A1.0 Existing, A2.0 Demo, A3.0 Proposed; board S13Sheets "Scale 3/4\" = 1'-0\"";
// AC-EZD-703-1): the viewport rules.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { sheetJobInputs } from '../../lazy/sheets/renderer';
import { sheetDrawingArea } from './sheet-set';
import {
  changeViewports,
  defaultViewports,
  setViewports,
  sheetDrawsPlan,
  sheetScaleLabel,
  viewportAreas,
  viewportScaleFactor,
  viewportScaleLabel,
  viewDrawsAs,
  viewShows,
  viewStatuses,
} from './viewport';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const GONE = '99999999-9999-4999-8999-999999999999';
const SHEETS = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
let n = 0;
const newId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, '0')}`;

describe('EZD-703 viewport rules', () => {
  it('scales: inches per foot over 12 paper inches per model inch; NTS has none', () => {
    expect(viewportScaleFactor('1/4')! * 48).toBeCloseTo(1, 12);
    expect(viewportScaleFactor('1/2')! * 24).toBeCloseTo(1, 12);
    expect(viewportScaleFactor('3/4')! * 16).toBeCloseTo(1, 12);
    expect(viewportScaleFactor('1-1/2')! * 8).toBeCloseTo(1, 12);
    expect(viewportScaleFactor('3')! * 4).toBeCloseTo(1, 12);
    expect(viewportScaleFactor('nts')).toBeNull();
  });

  it('prints the scale as the board writes it', () => {
    expect(viewportScaleLabel('3/4')).toBe(`3/4" = 1'-0"`);
    expect(viewportScaleLabel('1/4')).toBe(`1/4" = 1'-0"`);
    expect(viewportScaleLabel('1-1/2')).toBe(`1 1/2" = 1'-0"`);
    expect(viewportScaleLabel('nts')).toBe('NTS');
    expect(sheetScaleLabel([])).toBeNull();
    expect(sheetScaleLabel([{ scale: '1/4' }, { scale: '1/4' }])).toBe(`1/4" = 1'-0"`);
    expect(sheetScaleLabel([{ scale: '1/4' }, { scale: '1/2' }])).toBe('AS NOTED');
  });

  it('EZD-703 AC-1 Existing shows what stands today (Demo drawn as existing, 09m row 4), never New; Proposed is existing and new', () => {
    expect(viewStatuses('existing')).toEqual(['existing', 'demo']);
    expect(viewShows('existing', 'demo')).toBe(true);
    expect(viewDrawsAs('existing', 'demo')).toBe('existing');
    expect(viewDrawsAs('demo', 'demo')).toBe('demo');
    expect(viewShows('existing', 'new')).toBe(false);
    expect(viewShows('demo', 'demo')).toBe(true);
    expect(viewShows('demo', 'new')).toBe(false);
    expect(viewShows('proposed', 'demo')).toBe(false);
    expect(viewShows('proposed', 'new')).toBe(true);
    // An object with no status (a floor) is always shown.
    expect(viewShows('existing', undefined)).toBe(true);
    expect(defaultViewports('A1.0')[0]!.view).toBe('existing');
    expect(defaultViewports('A2.0')[0]!.view).toBe('demo');
    expect(defaultViewports('A3.0')[0]!.view).toBe('proposed');
  });

  it('only the plan and elevation sheets have default viewports', () => {
    const all = setViewports(null, SHEETS);
    expect(all.map((v) => v.sheet)).toEqual(['A1.0', 'A2.0', 'A3.0', 'A4.0', 'E1.0']);
    expect(sheetDrawsPlan(defaultViewports('A4.0'))).toBe(false);
    expect(sheetDrawsPlan(defaultViewports('A1.0'))).toBe(true);
    expect(setViewports({ viewports: [] }, SHEETS)).toEqual(setViewports(null, SHEETS));
    expect(setViewports({ viewports: [], viewportSheets: SHEETS }, SHEETS)).toEqual([]);
  });

  it('a change writes out that sheet\'s defaults with ids; a kind change takes its default scale', () => {
    const next = changeViewports(null, 'A4.0', { kind: 'update', index: 0, patch: { kind: 'plan' } }, newId)!;
    expect(next.viewportSheets).toEqual(['A4.0']);
    expect(next.viewports).toHaveLength(1);
    expect(next.viewports[0]).toMatchObject({ sheet: 'A4.0', kind: 'plan', scale: '1/4' });
    expect(typeof next.viewports[0]!.id).toBe('string');
    const back = changeViewports(next, 'A4.0', { kind: 'update', index: 0, patch: { kind: 'elevation' } }, newId)!;
    expect(back.viewports[0]).toMatchObject({ id: next.viewports[0]!.id, kind: 'elevation', scale: '1/2' });
    expect(changeViewports(null, 'A5.0', { kind: 'remove', index: 0 }, newId)).toBeNull();
  });

  it('a sheet never changed keeps its defaults: A6.0 ticked in after A1.0 was changed still draws its plan', () => {
    const changed = changeViewports(null, 'A1.0', { kind: 'update', index: 0, patch: { scale: '1/2' } }, newId)!;
    const withRcp = [...SHEETS.slice(0, 6), 'A6.0', ...SHEETS.slice(6)];
    const all = setViewports(changed, withRcp);
    expect(all.find((v) => v.sheet === 'A1.0')).toMatchObject({ scale: '1/2', view: 'existing' });
    expect(all.find((v) => v.sheet === 'A6.0')).toMatchObject({ kind: 'plan', view: 'proposed', scale: '1/4', id: null });
    // A removed viewport stays removed.
    const removed = changeViewports(changed, 'A2.0', { kind: 'remove', index: 0 }, newId)!;
    expect(setViewports(removed, SHEETS).filter((v) => v.sheet === 'A2.0')).toEqual([]);
    expect(removed.viewportSheets).toEqual(['A1.0', 'A2.0']);
  });

  it('Q-0509 a floor copy (A1.1) draws its own floor; the lowest floor\'s sheet names none', () => {
    const floors = [
      { id: F1, name: 'Floor 1' },
      { id: F2, name: 'Floor 2' },
    ];
    expect(defaultViewports('A1.1', floors)).toEqual([
      { id: null, sheet: 'A1.1', kind: 'plan', level: F2, view: 'existing', scale: '1/4' },
    ]);
    expect(defaultViewports('A2.1', floors)[0]).toMatchObject({ level: F2, view: 'demo' });
    expect(defaultViewports('A1.0', floors)[0]!.level).toBeNull();
    expect(defaultViewports('A5.1', floors)).toEqual([]);
  });

  it('a sheet\'s viewports share its drawing area in equal columns', () => {
    const area = { x: 1, y: 2, width: 12, height: 6 };
    expect(viewportAreas(area, 1)).toEqual([area]);
    expect(viewportAreas(area, 3).map((a) => [a.x, a.width])).toEqual([
      [1, 4],
      [5, 4],
      [9, 4],
    ]);
    expect(viewportAreas(area, 0)).toEqual([]);
  });

  it('renderer inputs: one job per plan or elevation viewport, its floor or the lowest when that floor is gone', () => {
    const floor = (name: string, order: number) => ({
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name, order },
    });
    const objects = new Map([
      [F1, floor('Floor 1', 1)],
      [F2, floor('Floor 2', 2)],
    ]);
    const inputs = sheetJobInputs({
      objects,
      size: '24x36',
      viewports: [
        { kind: 'plan', level: F2, view: 'existing', scale: '1/4' },
        { kind: 'elevation', level: null, view: 'proposed', scale: '1/2' },
        { kind: 'plan', level: GONE, view: 'demo', scale: 'nts' },
      ],
    });
    const area = sheetDrawingArea('24x36');
    expect(inputs.map((i) => [i.level, i.view, i.scale, i.elevation])).toEqual([
      [F2, 'existing', 1 / 48, undefined],
      [F1, 'proposed', 1 / 24, { walls: [] }],
      [F1, 'demo', null, undefined],
    ]);
    expect(inputs[0]!.area.width).toBeCloseTo(area.width / 3, 9);
    expect(inputs[2]!.area.x).toBeCloseTo(area.x + (2 * area.width) / 3, 9);
    expect(sheetJobInputs({ objects: new Map(), size: '24x36', viewports: defaultViewports('A1.0') })).toEqual([]);
  });
});
