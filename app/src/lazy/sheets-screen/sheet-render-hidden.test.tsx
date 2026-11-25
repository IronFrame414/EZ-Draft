// EZD-1975 (AC-EZD-1975-1, AC-EZD-1975-3; 11 rule 2 "Recompute only what changed, and only what is on screen"): edits
// made while Sheets is hidden draw nothing until Sheets is shown, then the open sheet is drawn exactly once, however
// late the model's updates arrive. The late update is a save's answer: it puts the server's numbers in the open model
// (model-store applySavedNumbers), which changes nothing the sheet draws. The screen draws through an injected
// renderer, so the count is the number of sheet renders asked for.
import { CURRENT_SCHEMA_VERSION, createWallData, objectNumber } from '@ezdraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import type { Change } from '../../editor/model/patches';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import type { SheetRenderer, SheetRenderRequest } from '../sheets';
import { sameDrawing } from './same-drawing';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const FLOOR = '11111111-1111-4111-8111-111111111111';
const SETS: SheetSetSummary[] = [
  {
    id: null,
    kind: 'permit',
    size: '24x36',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: defaultSheetSet([]),
  },
];
const fetchSets = async () => new Response(JSON.stringify({ sets: SETS }), { status: 200 });

const floor: ObjectValue = { type: 'floor', schemaVersion: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } };
function wall(x: number): ObjectValue {
  const made = createWallData({ start: { x, y: 0 }, end: { x, y: 120 }, level: FLOOR, thicknessSide: 'right' });
  if (!made.ok) throw new Error('wall data');
  return { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data };
}
const wallChange = (id: string, x: number): Change => ({ id, value: wall(x) });

const flush = () => new Promise((r) => setTimeout(r, 0));

// A renderer whose jobs end only when the test says so, to stand for a slow machine.
function setup(o: { held?: boolean } = {}) {
  const store = createModelStore({ objects: new Map([[FLOOR, floor]]) });
  const asked: SheetRenderRequest[] = [];
  const waiting: (() => void)[] = [];
  const renderer: SheetRenderer = {
    render: vi.fn(async (req: SheetRenderRequest) => {
      asked.push(req);
      if (o.held) await new Promise<void>((r) => waiting.push(r));
      return { markup: `<line data-object-id="n${req.objects.size}"/>`, shown: [] };
    }),
    dispose: vi.fn(),
  };
  const screen = createSheetsScreen(PROJECT, fetchSets, { loadRenderer: async () => renderer });
  const finish = async () => {
    for (const r of waiting.splice(0)) r();
    await flush();
  };
  return { store, screen, asked, finish };
}

async function shownOnA1(s: ReturnType<typeof setup>) {
  await s.screen.load();
  s.screen.setModel(s.store);
  s.screen.open('A1.0');
  s.screen.setShown(true);
  await flush();
  await s.finish();
  expect(s.screen.get().renders).toBe(1);
}

describe('EZD-1975 the sheet is drawn once on return from Plan edits', () => {
  it('EZD-1975 AC-3 edits made while Sheets is hidden cause no draw until Sheets is shown, then exactly one', async () => {
    const s = setup();
    await shownOnA1(s);

    // Hidden: three edits, and the saved numbers of the first, draw nothing.
    s.screen.setShown(false);
    s.store.applyEdit([wallChange('w1', 0)]);
    await flush();
    s.store.applyEdit([wallChange('w2', 48)]);
    expect(s.store.applySavedNumbers([{ id: 'w1', number: 1 }])).toEqual(['w1']);
    await flush();
    s.store.applyEdit([wallChange('w3', 96)]);
    await flush();
    expect(s.asked).toHaveLength(1);
    expect(s.screen.get().renders).toBe(1);

    // Shown: exactly one draw, of the model as it is now (the floor and three walls).
    s.screen.setShown(true);
    await flush();
    expect(s.asked).toHaveLength(2);
    expect(s.screen.get().renders).toBe(2);
    expect(s.asked[1]!.objects.size).toBe(4);
    expect(s.screen.get().drawing?.markup).toBe('<line data-object-id="n4"/>');
  });

  it('EZD-1975 AC-1 a save answer that lands after the return does not draw the sheet a second time', async () => {
    const s = setup();
    await shownOnA1(s);
    s.screen.setShown(false);
    s.store.applyEdit([wallChange('w1', 0)]);
    s.store.applyEdit([wallChange('w2', 48)]);
    s.store.applyEdit([wallChange('w3', 96)]);
    s.screen.setShown(true);
    await flush();
    expect(s.screen.get().renders).toBe(2);

    // The three saves answer one by one after the return: each changes the model's objects, none draws.
    for (const [i, id] of ['w1', 'w2', 'w3'].entries()) {
      const before = s.store.getState().objects;
      expect(s.store.applySavedNumbers([{ id, number: i + 1 }])).toEqual([id]);
      expect(s.store.getState().objects).not.toBe(before);
      await flush();
    }
    expect(objectNumber(s.store.getState().objects.get('w3')!)).toBe(3);
    expect(s.asked).toHaveLength(2);
    expect(s.screen.get().renders).toBe(2);

    // Hidden and shown again with only those numbers new: still nothing to draw.
    s.screen.setShown(false);
    s.screen.setShown(true);
    await flush();
    expect(s.screen.get().renders).toBe(2);
  });

  it('EZD-1975 AC-1 a save answer that lands while the return draw is still running is folded into it', async () => {
    const s = setup({ held: true });
    await shownOnA1(s);
    s.screen.setShown(false);
    s.store.applyEdit([wallChange('w1', 0)]);
    s.screen.setShown(true);
    await flush();
    expect(s.asked).toHaveLength(2);
    // The draw has not ended when the answer lands.
    expect(s.store.applySavedNumbers([{ id: 'w1', number: 1 }])).toEqual(['w1']);
    await flush();
    await s.finish();
    expect(s.asked).toHaveLength(2);
    expect(s.screen.get().renders).toBe(2);
    expect(s.screen.get().drawing?.markup).toBe('<line data-object-id="n2"/>');
  });

  it('EZD-1975 an edit while Sheets is shown still draws the sheet, with or without saved numbers', async () => {
    const s = setup();
    await shownOnA1(s);
    s.store.applyEdit([wallChange('w1', 0)]);
    await flush();
    expect(s.screen.get().renders).toBe(2);
    // The wall moved after its number arrived: a real change.
    s.store.applySavedNumbers([{ id: 'w1', number: 1 }]);
    await flush();
    expect(s.screen.get().renders).toBe(2);
    s.store.applyEdit([wallChange('w1', 48)]);
    await flush();
    expect(s.screen.get().renders).toBe(3);
  });
});

describe('EZD-1975 sameDrawing', () => {
  const a = wall(0);
  const numbered = (v: ObjectValue, n: number): ObjectValue => {
    const data = v.data as { attributes: Record<string, unknown> };
    return { ...v, data: { ...data, attributes: { ...data.attributes, number: n } } } as ObjectValue;
  };

  it('models that differ only in object numbers draw the same', () => {
    const one = new Map([[FLOOR, floor], ['w1', a]]);
    expect(sameDrawing(one, one)).toBe(true);
    expect(sameDrawing(one, new Map(one))).toBe(true);
    expect(sameDrawing(one, new Map([[FLOOR, floor], ['w1', numbered(a, 1)]]))).toBe(true);
    expect(sameDrawing(new Map([['w1', numbered(a, 1)]]), new Map([['w1', numbered(a, 2)]]))).toBe(true);
  });

  it('any other difference does not', () => {
    const one = new Map([[FLOOR, floor], ['w1', a]]);
    expect(sameDrawing(one, new Map([[FLOOR, floor]]))).toBe(false);
    expect(sameDrawing(one, new Map([[FLOOR, floor], ['w2', a]]))).toBe(false);
    expect(sameDrawing(one, new Map([[FLOOR, floor], ['w1', wall(48)]]))).toBe(false);
    const data = a.data as { attributes: Record<string, unknown> };
    const other = { ...a, data: { ...data, attributes: { ...data.attributes, extra: 1 } } } as ObjectValue;
    expect(sameDrawing(one, new Map([[FLOOR, floor], ['w1', other]]))).toBe(false);
    // A floor carries no number: a floor with new data is a change.
    const floor2 = { ...floor, data: { ...(floor.data as object) } } as ObjectValue;
    expect(sameDrawing(one, new Map([[FLOOR, floor2], ['w1', a]]))).toBe(false);
  });
});
