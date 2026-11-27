// EZD-708b E1.0 electrical plan (AC-EZD-708b-1 "RCP acceptance part 2: a light on the RCP appears on E1.0 with the same
// circuit."). Expected values come from the acceptance criterion, board S06Electrical (a "14" tag beside each device
// of circuit 14 and the home run tagged "A-14" for Panel A), Q-0763 (E1.0 the first floor's layout; E2.0, E3.0 for
// further floors; the panel sheet after the last layout; a one-floor project keeps E1.0 Electrical, E2.0 Panel + load
// calc) and S06/09a ("Every electrical sheet carries the note that the electrical contractor of record verifies the
// design"). The model is one 144 x 120 in room on Floor 1 with Panel A, circuit 14 (Kitchen lighting, 15 A) and two
// recessed lights on it, plus a third light on no circuit.
import {
  CURRENT_SCHEMA_VERSION,
  type DrawingItem,
  type Point,
  type StoredObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../outbox/model-api';
import { createSheetRenderer, sheetEcNoteJobInput, sheetJobInputs } from '../../lazy/sheets';
import {
  runSheetJob,
  sheetJob,
  type SheetEcNoteJobInput,
  type SheetJobInput,
} from '../../workers/sheet-job';
import { electricalViewportDrawingList } from '../../lazy/electrical-sheet';
import { rcpViewportDrawingList } from '../../lazy/rcp-sheet';
import {
  EC_NOTE_TEXT,
  ecNoteFor,
  EC_NOTE_OBJECT_ID,
  wrapLines,
  isElectricalLayoutSheet,
  isElectricalSheet,
  panelSheetNumber,
} from './electrical-kinds';
import { defaultSheetSet, sheetDrawingArea, sheetNotesColumn, withFloorSheets } from './sheet-set';
import { defaultViewports } from './viewport';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const R1 = '61111111-1111-4111-8111-111111111111';
const PANEL = '51111111-1111-4111-8111-111111111111';
const C14 = '52222222-2222-4222-8222-222222222222';
const L1 = '71111111-1111-4111-8111-111111111111';
const L2 = '72222222-2222-4222-8222-222222222222';
const LOOSE = '73333333-3333-4333-8333-333333333333';
const UP = '74444444-4444-4444-8444-444444444444';
const P = (x: number, y: number): Point => ({ x, y });

const stored = (id: string, type: string, data: unknown): StoredObject => ({
  id,
  type,
  schema_version: CURRENT_SCHEMA_VERSION,
  data,
});
const light = (id: string, at: Point, circuit: string | null, level = F1) =>
  stored(id, 'device', {
    geometry: { point: at },
    status: 'new',
    level,
    attributes: { kind: 'recessed_light', typeTag: 'A', lumens: 650, circuit },
  });

const BASE: StoredObject[] = [
  stored(F1, 'floor', { name: 'Floor 1', order: 1 }),
  stored(R1, 'room', {
    geometry: { boundary: [P(0, 0), P(144, 0), P(144, 120), P(0, 120)] },
    status: 'existing',
    level: F1,
    attributes: {
      name: 'Kitchen',
      floorLevel: 0,
      photos: [],
      roomType: null,
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    },
    closureOverride: null,
  }),
  stored(PANEL, 'panel', {
    geometry: { point: P(5, 5) },
    status: 'existing',
    level: F1,
    attributes: {
      name: 'Panel A',
      parentPanel: null,
      serviceSize: 200,
      mainBreaker: 200,
      spaces: 40,
    },
  }),
  stored(C14, 'circuit', {
    status: 'new',
    level: F1,
    attributes: {
      panel: PANEL,
      space: 14,
      poles: 1,
      name: 'Kitchen lighting',
      breaker: 15,
      protection: 'afci',
      dedicated: false,
      load: 130,
      order: [L1, L2],
    },
  }),
  light(L1, P(36, 60), C14),
  light(L2, P(108, 60), C14),
  light(LOOSE, P(72, 100), null),
];

const objectsMap = (list: readonly StoredObject[]): Map<string, ObjectValue> =>
  new Map(
    list.map((o) => [
      o.id,
      { type: o.type, schemaVersion: o.schema_version, data: o.data as Record<string, unknown> },
    ]),
  );

const viewportsOf = (sheet: string, floors: { id: string; name: string }[] = []) =>
  defaultViewports(sheet, floors).map((vp) => ({
    kind: vp.kind,
    level: vp.level,
    view: vp.view,
    scale: vp.scale,
  }));
const inputsFor = (list: readonly StoredObject[], sheet: string) =>
  sheetJobInputs({
    objects: objectsMap(list),
    size: '24x36',
    viewports: viewportsOf(sheet),
    sheet,
  });

const texts = (items: readonly DrawingItem[], objectId: string) =>
  items
    .filter(
      (i): i is Extract<DrawingItem, { kind: 'text' }> =>
        i.kind === 'text' && i.objectId === objectId,
    )
    .map((i) => i.text);

describe('EZD-708b AC-EZD-708b-1 a light on the RCP appears on E1.0 with the same circuit', () => {
  it('the light printed on A6.0 prints on E1.0 tagged with its circuit, 14, and the home run A-14', async () => {
    const [rcp] = inputsFor(BASE, 'A6.0');
    const a6 = await runSheetJob(rcp);
    expect(a6.shown).toEqual(expect.arrayContaining([L1, L2]));

    const [vp] = inputsFor(BASE, 'E1.0');
    expect(vp!.electrical).toBe(true);
    expect(vp!.rcp).toBeUndefined();
    const e1 = await runSheetJob(vp);
    expect(e1.shown).toEqual(expect.arrayContaining([L1, L2]));
    expect(e1.markup).toContain(`data-object-id="${L1}"`);
    // The circuit tag and the home-run tag print as text.
    expect(e1.markup).toMatch(/>14<\/text>/);
    expect(e1.markup).toMatch(/>A-14<\/text>/);

    // The tag is the light's own: both lights carry "14"; the first on the circuit carries the home run "A-14".
    const list = electricalViewportDrawingList(BASE, F1, 'proposed');
    expect(texts(list.items, L1)).toEqual(expect.arrayContaining(['14', 'A-14']));
    expect(texts(list.items, L2)).toEqual(['14']);
    // A light on no circuit prints with no circuit tag.
    expect(list.items.some((i) => i.objectId === LOOSE)).toBe(true);
    expect(texts(list.items, LOOSE)).toEqual([]);
    // The circuit line joins the two lights.
    expect(list.items.some((i) => i.kind === 'line' && i.objectId === L1)).toBe(true);

    // The RCP draws the same light objects, without circuit tags (circuits belong to E1.0).
    const rcpList = rcpViewportDrawingList(BASE, F1, 'proposed');
    expect(rcpList.items.some((i) => i.objectId === L1)).toBe(true);
    expect(texts(rcpList.items, L1)).not.toContain('14');
  });

  it('a light moved to another circuit carries the new circuit on E1.0', () => {
    const C16 = '53333333-3333-4333-8333-333333333333';
    const c16 = stored(C16, 'circuit', {
      status: 'new',
      level: F1,
      attributes: {
        panel: PANEL,
        space: 16,
        poles: 1,
        name: 'Lights 2',
        breaker: 15,
        protection: null,
        dedicated: false,
        load: 65,
      },
    });
    const moved = [...BASE.filter((o) => o.id !== L2), c16, light(L2, P(108, 60), C16)];
    const list = electricalViewportDrawingList(moved, F1, 'proposed');
    expect(texts(list.items, L2)).toEqual(expect.arrayContaining(['16', 'A-16']));
    expect(texts(list.items, L2)).not.toContain('14');
  });

  it('the main-thread sheetJob leaves an electrical viewport to the lazy module; other plan sheets stay plain', () => {
    const [vp] = inputsFor(BASE, 'E1.0');
    expect(() => sheetJob(vp)).toThrow('sheet_electrical_lazy');
    const [a3] = inputsFor(BASE, 'A3.0');
    expect(a3!.electrical).toBeUndefined();
    expect(sheetJob(a3).markup).not.toMatch(/>A-14<\/text>/);
    expect(() => sheetJob({ ...(vp as SheetJobInput), electrical: 'yes' })).toThrow('sheet_input');
  });

  it('the renderer draws E1.0 with the circuit tags and the EC note', async () => {
    const renderer = createSheetRenderer((input) => runSheetJob(input));
    const svg = await renderer.render({
      objects: objectsMap(BASE),
      size: '24x36',
      viewports: viewportsOf('E1.0'),
      sheet: 'E1.0',
    });
    expect(svg).not.toBeNull();
    expect(svg!.markup).toMatch(/>A-14<\/text>/);
    expect(svg!.markup).toContain(`>${EC_NOTE_TEXT}</text>`);
  });
});

describe('EZD-708b every device the toolbar places prints on E1.0', () => {
  it('each kind on a circuit draws through the worker job with its circuit tag', async () => {
    // The device toolbar's kinds (editor/electrical/toolbar-items.ts).
    const kinds = [
      'receptacle_duplex',
      'receptacle_240v',
      'switch_single',
      'switch_3way',
      'switch_dimmer',
      'recessed_light',
      'ceiling_fan',
      'smoke_detector',
      'co_detector',
      'smoke_co_detector',
      'data',
      'tv',
      'speaker',
      'camera',
      'wifi_ap',
      'doorbell',
    ];
    const ids = kinds.map((_, i) => `9${String(i).padStart(7, '0')}-1111-4111-8111-111111111111`);
    const devices = kinds.map((kind, i) =>
      stored(ids[i]!, 'device', {
        geometry: { point: P(10 + i * 8, 20) },
        status: 'new',
        level: F1,
        attributes: { kind, circuit: C14 },
      }),
    );
    const [vp] = inputsFor([...BASE, ...devices], 'E1.0');
    const svg = await runSheetJob(vp);
    expect(svg.shown).toEqual(expect.arrayContaining(ids));
    const list = electricalViewportDrawingList([...BASE, ...devices], F1, 'proposed');
    for (const id of ids) expect(texts(list.items, id)).toContain('14');
  });
});

describe('EZD-708b the EC verification note on the electrical sheets', () => {
  it('E1.0 and E2.0 carry the note; architectural sheets do not', async () => {
    expect(isElectricalSheet('E1.0')).toBe(true);
    expect(isElectricalSheet('E2.0')).toBe(true);
    expect(isElectricalSheet('A6.0')).toBe(false);
    expect(isElectricalSheet('A1.1')).toBe(false);
    const req = { objects: objectsMap(BASE), size: '24x36' as const, viewports: [], sheet: 'E1.0' };
    const job = sheetEcNoteJobInput(req) as SheetEcNoteJobInput;
    expect(job).toEqual({ ecNote: { sheet: 'E1.0', size: '24x36' } });
    const svg = await runSheetJob(job);
    expect(svg.markup).toContain(`>${EC_NOTE_TEXT}</text>`);
    expect(sheetEcNoteJobInput({ ...req, sheet: 'A3.0' })).toBeNull();
    expect(ecNoteFor('A3.0', '24x36')).toBeNull();
    expect(ecNoteFor('E2.0', '11x17')).not.toBeNull();
  });

  it('the note is the general notes block at the bottom of the notes column, clear of the viewports', () => {
    for (const size of ['24x36', '11x17'] as const) {
      const column = sheetNotesColumn(size);
      const lines = ecNoteFor('E1.0', size)!;
      expect(lines.map((l) => texts(l.list.items, EC_NOTE_OBJECT_ID)[0])).toEqual([
        'GENERAL NOTES',
        'Electrical design to be verified by the electrical contractor of record.',
      ]);
      const last = lines[lines.length - 1]!.area;
      expect(last.y + last.height).toBeCloseTo(column.y + column.height, 9);
      for (const { area } of lines) {
        expect(area.x).toBe(column.x);
        expect(area.width).toBeLessThanOrEqual(column.width);
        expect(area.y).toBeGreaterThanOrEqual(column.y);
      }
    }
    // The viewports keep the whole drawing area.
    const [vp] = sheetJobInputs({
      objects: objectsMap(BASE),
      size: '24x36',
      viewports: viewportsOf('E1.0'),
      sheet: 'E1.0',
    });
    expect(vp!.area).toEqual(sheetDrawingArea('24x36'));
  });

  it('a note too wide for its column wraps at the words', () => {
    expect(wrapLines('aaaa bbbb cccc', 1e9, 7)).toEqual(['aaaa bbbb cccc']);
    expect(wrapLines('aaaa bbbb cccc', 0, 7)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });
});

describe('EZD-708b Q-0763 electrical sheets per floor', () => {
  const floors = [
    { id: F1, name: 'Floor 1' },
    { id: F2, name: 'Second floor' },
  ];

  it('one floor keeps E1.0 Electrical and E2.0 Panel + load calc', () => {
    const set = withFloorSheets(defaultSheetSet([]), [floors[0]!]);
    expect(set.filter((s) => s.group === 'electrical').map((s) => [s.number, s.title])).toEqual([
      ['E1.0', 'Electrical'],
      ['E2.0', 'Panel + load calc'],
    ]);
    expect(panelSheetNumber(1)).toBe('E2.0');
    expect(panelSheetNumber(0)).toBe('E2.0');
    expect(defaultViewports('E2.0', [floors[0]!])).toEqual([]);
    expect(isElectricalLayoutSheet('E2.0', 1)).toBe(false);
  });

  it('two floors add E2.0 for the second floor and move the panel sheet to E3.0', () => {
    const set = withFloorSheets(defaultSheetSet([]), floors);
    expect(set.filter((s) => s.group === 'electrical').map((s) => [s.number, s.title])).toEqual([
      ['E1.0', 'Electrical'],
      ['E2.0', 'Electrical · Second floor'],
      ['E3.0', 'Panel + load calc'],
    ]);
    expect(set.map((s) => s.number).slice(-4)).toEqual(['E1.0', 'E2.0', 'E3.0', 'R1.0']);
    expect(isElectricalLayoutSheet('E2.0', 2)).toBe(true);
    // E2.0 draws the second floor's proposed plan at E1.0's scale; the panel sheet has no viewport.
    expect(defaultViewports('E2.0', floors)).toEqual([
      { ...defaultViewports('E1.0', floors)[0]!, sheet: 'E2.0', level: F2 },
    ]);
    expect(defaultViewports('E3.0', floors)).toEqual([]);
    expect(defaultViewports('E1.0', floors)[0]).toMatchObject({
      kind: 'plan',
      view: 'proposed',
      level: null,
    });
  });

  it('applying it again changes nothing; a floor removed drops its layout and the panel sheet moves back', () => {
    const three = [...floors, { id: 'c', name: 'Third floor' }];
    const once = withFloorSheets(defaultSheetSet([]), three);
    expect(once.filter((s) => s.group === 'electrical').map((s) => s.number)).toEqual([
      'E1.0',
      'E2.0',
      'E3.0',
      'E4.0',
    ]);
    expect(withFloorSheets(once, three)).toEqual(once);
    expect(withFloorSheets(once, floors)).toEqual(withFloorSheets(defaultSheetSet([]), floors));
    expect(withFloorSheets(once, floors.slice(0, 1))).toEqual(defaultSheetSet([]));
  });

  it('the second floor layout draws its own floor’s lights with their circuit', async () => {
    const two = [
      ...BASE,
      stored(F2, 'floor', { name: 'Second floor', order: 2 }),
      light(UP, P(50, 50), C14, F2),
    ];
    const vps = defaultViewports('E2.0', floors).map((vp) => ({
      kind: vp.kind,
      level: vp.level,
      view: vp.view,
      scale: vp.scale,
    }));
    const [vp] = sheetJobInputs({
      objects: objectsMap(two),
      size: '24x36',
      viewports: vps,
      sheet: 'E2.0',
    });
    expect(vp).toMatchObject({ level: F2, electrical: true });
    const svg = await runSheetJob(vp);
    expect(svg.shown).toContain(UP);
    expect(svg.shown).not.toContain(L1);
    expect(svg.markup).toMatch(/>14<\/text>/);
  });
});
