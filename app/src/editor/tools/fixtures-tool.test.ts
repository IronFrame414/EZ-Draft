// EZD-234 (AC-EZD-234-1, -2, -3, -5; S03 Fixtures, Validation; S03:146; Q-0704 05-screens; 09q Utilities to move).
// Real model store; the canvas handle is a local fake (as drawing-controller.test.ts). Expected values worked by hand:
// a 30" × 26" range placed at (60, 13) facing down covers x 45 to 75, y 0 to 26; a gas point at (66, 2) and an
// electric point at (55, 2) are inside it; after the range moves 24" east (x 69 to 99) they are 3" and 14" away.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SNAP_SETTINGS,
  parseStoredObject,
  type ModelObject,
  type Point,
  type UtilityPointObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { deleteChanges } from '../edit/edit-changes';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { editorRail } from '../selection/selection-controller';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { fixtureChoice, placeFixture, utilityChoice, type FixtureChoice } from './fixture-tool';
import { linkedFixture } from './fixture-geometry';
import { fixturesModule } from './fixtures-module';
import { baseObjects, F1, idSeq, uid, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const NO_SNAP = () => ({ ...DEFAULT_SNAP_SETTINGS, enabled: false });

function ev(kind: PlanPointerEvent['kind'], x: number, y: number, pointerType = 'mouse') {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as PlanPointerEvent;
}

const key = (k: string): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
});

function setup(canEdit = true, objects: Map<string, ObjectValue> = baseObjects()) {
  const store = createModelStore({ objects });
  let receiver: PlanPointerReceiver | null = null;
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void (receiver = r),
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  const msgs: string[] = [];
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: (k) => void msgs.push(k),
    newId: idSeq(100),
    snapSettings: NO_SNAP,
  });
  const send = (e: PlanPointerEvent) => {
    if (receiver === null) throw new Error('no pointer receiver set');
    receiver(e);
  };
  const parsed = (id: string): ModelObject | null => {
    const v = store.getState().objects.get(id);
    if (v === undefined) return null;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    return r.ok ? r.object : null;
  };
  return { store, controller, send, msgs, parsed };
}

// The Fixtures code loads lazily: wait for it and for the controller's own then().
const loaded = async () => {
  await fixturesModule.load();
  await new Promise((r) => setTimeout(r, 0));
};

const RANGE: FixtureChoice = {
  ...(fixtureChoice('range') as Extract<FixtureChoice, { type: 'fixture' }>),
  width: 30,
  depth: 26,
};

describe('EZD-234 Fixtures tool', () => {
  it('AC-2 F opens the Fixtures tool; a click places the chosen fixture with width, depth and direction', async () => {
    const { controller, send, parsed, store } = setup();
    expect(controller.keyDown(key('f'))).toBe(true);
    expect(controller.getUi().tool).toBe('fixtures');
    await loaded();
    expect(controller.getUi().fixtureChoice).toEqual(fixtureChoice('toilet'));
    controller.setFixtureChoice({ ...RANGE, facing: 'right' });
    send(ev('down', 60, 13));
    send(ev('up', 60, 13));
    const placed = parsed(uid(100));
    expect(placed).toEqual({
      id: uid(100),
      type: 'fixture',
      data: {
        geometry: { center: { x: 60, y: 13 }, axis: { x: 0, y: 1 } },
        status: 'existing',
        level: F1,
        attributes: { kind: 'range', width: 30, depth: 26 },
      },
    });
    expect(store.getState().objects.get(uid(100))?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(controller.keyDown(key('Escape'))).toBe(true);
    expect(controller.getUi().tool).toBeNull();
  });

  it('AC-2 a touch places on lift; a size not above 0 places nothing and says so', async () => {
    const { controller, send, store, msgs } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice({ ...RANGE, width: 0 });
    send(ev('down', 10, 10));
    send(ev('up', 10, 10));
    expect(store.getState().objects.size).toBe(1);
    expect(msgs).toEqual(['office.fixtures.invalid']);
    controller.setFixtureChoice(RANGE);
    send(ev('down', 10, 10, 'touch'));
    expect(store.getState().objects.size).toBe(1);
    send(ev('up', 10, 10, 'touch'));
    expect(store.getState().objects.size).toBe(2);
  });

  it('AC-3 a utility point placed on an appliance links to it; elsewhere it links to none; volts and amps only for electric', async () => {
    const { controller, send, parsed } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(RANGE);
    send(ev('down', 60, 13));
    controller.setFixtureChoice({
      ...utilityChoice('electric'),
      volts: 240,
      amps: 50,
    } as FixtureChoice);
    send(ev('down', 55, 2));
    controller.setFixtureChoice(utilityChoice('gas'));
    send(ev('down', 120, 2));
    expect(parsed(uid(101))?.data).toMatchObject({
      geometry: { point: { x: 55, y: 2 } },
      attributes: { kind: 'electric', volts: 240, amps: 50, servesObjectId: uid(100) },
    });
    expect(parsed(uid(102))?.data).toMatchObject({
      attributes: { kind: 'gas', volts: null, amps: null, servesObjectId: null },
    });
  });

  it('AC-3 placeFixture refuses 0 A (09q row 5)', () => {
    const ctx = { level: F1, objects: [], newId: idSeq(1) };
    const zero = { ...utilityChoice('electric'), amps: 0 } as FixtureChoice;
    expect(placeFixture(zero, pt(0, 0), ctx)).toBeNull();
    expect(placeFixture(utilityChoice('electric'), pt(0, 0), ctx)?.value?.data).toMatchObject({
      attributes: { kind: 'electric', volts: 120, amps: 20 },
    });
  });

  it('AC-1 moving the range 24" lists its gas and electric points with their distances; Close clears it', async () => {
    const { controller, send } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(RANGE);
    send(ev('down', 60, 13));
    controller.setFixtureChoice({
      ...utilityChoice('electric'),
      volts: 240,
      amps: 50,
    } as FixtureChoice);
    send(ev('down', 55, 2));
    controller.setFixtureChoice(utilityChoice('gas'));
    send(ev('down', 66, 2));
    controller.selectTool(null);
    controller.startDrag([uid(100)], pt(60, 13));
    controller.dragPointer(ev('move', 84, 13));
    controller.dragPointer(ev('up', 84, 13));
    await loaded();
    expect(controller.getUi().utilities).toEqual([
      {
        fixtureId: uid(100),
        utilities: [
          { pointId: uid(101), kind: 'electric', distance: 14 },
          { pointId: uid(102), kind: 'gas', distance: 3 },
        ],
      },
    ]);
    controller.dismissUtilities();
    expect(controller.getUi().utilities).toBeNull();
  });

  it('AC-1 a fixture with no linked points moved shows no list (09q row 2)', async () => {
    const { controller, send } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(fixtureChoice('refrigerator'));
    send(ev('down', 60, 15));
    controller.selectTool(null);
    controller.startDrag([uid(100)], pt(60, 15));
    controller.dragPointer(ev('up', 84, 15));
    await loaded();
    expect(controller.getUi().utilities).toBeNull();
  });

  it('AC-5 without Edit model the Fixtures tool is not offered and F does nothing', () => {
    const { controller } = setup(false);
    expect(controller.getUi().enabled).toBe(false);
    expect(controller.keyDown(key('f'))).toBe(false);
    controller.selectTool('fixtures');
    expect(controller.getUi().tool).toBeNull();
    const base = { canvasFailed: false, controllerEnabled: true };
    const view = editorRail({ ...base, editor: 'ready', canEdit: false });
    expect(view?.tools.map((t) => t.id)).toEqual(['select', 'measure']);
    const edit = editorRail({ ...base, editor: 'ready', canEdit: true });
    expect(edit?.tools.find((t) => t.id === 'fixtures')).toMatchObject({ shortcut: 'F' });
    const loading = editorRail({ ...base, editor: 'loading', canEdit: false });
    expect(loading?.disabled).toBe(true);
  });
});

describe('EZD-234 deleting an appliance', () => {
  it('AC-3 Delete removes the range; its linked point stays as it was and reads as no appliance (09q row 4)', async () => {
    const { controller, send, store, parsed } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(RANGE);
    send(ev('down', 60, 13));
    controller.setFixtureChoice(utilityChoice('gas'));
    send(ev('down', 66, 2));
    const point = parsed(uid(101));
    expect(point?.data).toMatchObject({ attributes: { servesObjectId: uid(100) } });
    store.applyEdit(deleteChanges(store.getState().objects, F1, [uid(100)], idSeq(200)));
    expect(store.getState().objects.has(uid(100))).toBe(false);
    expect(parsed(uid(101))).toEqual(point);
    const models = [...store.getState().objects.keys()]
      .map((id) => parsed(id))
      .filter((o): o is ModelObject => o !== null);
    expect(linkedFixture(point as UtilityPointObject, models)).toBeNull();
  });
});
