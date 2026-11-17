// EZD-226 (AC-EZD-226-1, -2, -3; S03 Fixtures; Q-0704; 09q Tile shower rows 1, 4, 6, 7, 9; vault/build/assumptions.md
// EZD-226). Real model store; the canvas handle is a local fake (as fixtures-tool.test.ts). Expected values worked by
// hand: a 60" x 36" shower placed at (30, 18) facing down is the box x 0 to 60, y 0 to 36 with footprint
// (0,0), (60,0), (60,36), (0,36); the linear drain runs the whole 60" back wall (side 2); its one niche is on side 2.
// Facing right (axis +y, back toward -x), placed at (0, 0), footprint[0] = (0 + 18, 0 - 30) = (18, -30), then (18, 30),
// (-18, 30), (-18, -30). Dragged 24" east, the footprint moves to x 24 to 84 and the attributes stay as stored.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SNAP_SETTINGS,
  parseStoredObject,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { deleteChanges } from '../edit/edit-changes';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { createDrawingController, type DrawingHandle } from './drawing-controller';
import { placeFixture, tileShowerChoice, type FixtureChoice } from './fixture-tool';
import { fixturesModule } from './fixtures-module';
import { baseObjects, F1, idSeq, uid, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });

function ev(kind: PlanPointerEvent['kind'], x: number, y: number) {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as PlanPointerEvent;
}

function setup() {
  const store = createModelStore({ objects: baseObjects() });
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
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: (k) => void msgs.push(k),
    newId: idSeq(100),
    snapSettings: () => ({ ...DEFAULT_SNAP_SETTINGS, enabled: false }),
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

const loaded = async () => {
  await fixturesModule.load();
  await new Promise((r) => setTimeout(r, 0));
};

type Shower = Extract<FixtureChoice, { type: 'tile_shower' }>;
const BATH: Shower = {
  ...(tileShowerChoice() as Shower),
  curb: { height: 4, width: 4 },
  nicheCount: 1,
  drain: 'linear',
};

const BATH_ATTRIBUTES = {
  curb: { height: 4, width: 4 },
  niches: [{ width: 12, height: 24, bottomHeight: 48, side: 2 }],
  bench: null,
  glass: [],
  panSlope: 0.25,
  drain: { type: 'linear', side: 2, offset: 0, length: 60 },
};

describe('EZD-226 Custom tile shower in the Fixtures tool', () => {
  it('starts 60" x 36" with a 4" curb, no niches, a center drain and 1/4" per ft', () => {
    expect(tileShowerChoice()).toEqual({
      type: 'tile_shower',
      width: 60,
      depth: 36,
      facing: 'down',
      curb: { height: 4, width: 4 },
      nicheCount: 0,
      niche: { width: 12, height: 24, bottomHeight: 48 },
      bench: null,
      glass: null,
      drain: 'center',
      panSlope: 0.25,
    });
  });

  it('AC-2 a bench, a door and a sized niche are stored as chosen; glass goes on the front (side 0)', () => {
    const ctx = { level: F1, objects: [], newId: idSeq(1) };
    const full = placeFixture(
      {
        ...BATH,
        niche: { width: 14, height: 12, bottomHeight: 40 },
        bench: { width: 24, depth: 15, height: 18 },
        glass: { type: 'door', length: 30, swing: 'out' },
      },
      pt(30, 18),
      ctx,
    );
    expect(full?.value?.data).toMatchObject({
      attributes: {
        niches: [{ width: 14, height: 12, bottomHeight: 40, side: 2 }],
        bench: { width: 24, depth: 15, height: 18 },
        glass: [{ type: 'door', length: 30, side: 0, swing: 'out' }],
      },
    });
    const fixed = placeFixture(
      { ...BATH, glass: { type: 'fixed', length: 60, swing: 'out' } },
      pt(30, 18),
      ctx,
    );
    expect(fixed?.value?.data).toMatchObject({
      attributes: { glass: [{ type: 'fixed', length: 60, side: 0 }] },
    });
    expect(
      (fixed?.value?.data as { attributes: { glass: object[] } }).attributes.glass[0],
    ).not.toHaveProperty('swing');
  });

  it.each([
    ['bench depth 0', { bench: { width: 24, depth: 0, height: 18 } }],
    ['bench height -18', { bench: { width: 24, depth: 15, height: -18 } }],
    ['glass length 0', { glass: { type: 'door', length: 0, swing: 'in' } }],
    ['niche width 0', { niche: { width: 0, height: 24, bottomHeight: 48 } }],
    ['niche bottom -1', { niche: { width: 12, height: 24, bottomHeight: -1 } }],
  ] as const)('AC-2 %s places nothing', (_n, part) => {
    const ctx = { level: F1, objects: [], newId: idSeq(1) };
    expect(placeFixture({ ...BATH, ...part } as FixtureChoice, pt(30, 18), ctx)).toBeNull();
  });

  it('AC-1 a click places the 5x8 bath shower with curb, niche, linear drain and pan slope', async () => {
    const { controller, send, parsed, store } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(BATH);
    send(ev('down', 30, 18));
    send(ev('up', 30, 18));
    expect(parsed(uid(100))).toEqual({
      id: uid(100),
      type: 'tile_shower',
      data: {
        geometry: { footprint: [pt(0, 0), pt(60, 0), pt(60, 36), pt(0, 36)] },
        status: 'existing',
        level: F1,
        attributes: BATH_ATTRIBUTES,
      },
    });
    expect(store.getState().objects.get(uid(100))?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('AC-2 a curbless 24" x 24" shower with no niches places; a 0" or negative size places nothing and says so', async () => {
    const { controller, send, store, msgs, parsed } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice({ ...BATH, width: 0 });
    send(ev('down', 10, 10));
    controller.setFixtureChoice({ ...BATH, curb: { height: -4, width: 4 } });
    send(ev('down', 10, 10));
    controller.setFixtureChoice({ ...BATH, panSlope: 0 });
    send(ev('down', 10, 10));
    expect(store.getState().objects.size).toBe(1);
    expect(msgs).toEqual([
      'office.fixtures.invalid',
      'office.fixtures.invalid',
      'office.fixtures.invalid',
    ]);
    controller.setFixtureChoice({
      ...BATH,
      width: 24,
      depth: 24,
      curb: null,
      nicheCount: 0,
      drain: 'center',
    });
    send(ev('down', 12, 12));
    const placed = parsed(uid(103));
    expect(placed?.data).toMatchObject({
      geometry: { footprint: [pt(0, 0), pt(24, 0), pt(24, 24), pt(0, 24)] },
      attributes: { curb: null, niches: [], drain: { type: 'center', at: pt(12, 12) } },
    });
  });

  it('two niches go on the back and right walls; a shower deeper than wide puts a linear drain on the right wall', () => {
    const ctx = { level: F1, objects: [], newId: idSeq(1) };
    const two = placeFixture({ ...BATH, nicheCount: 2 }, pt(30, 18), ctx);
    expect(two?.value?.data).toMatchObject({
      attributes: {
        niches: [
          { width: 12, height: 24, bottomHeight: 48, side: 2 },
          { width: 12, height: 24, bottomHeight: 48, side: 1 },
        ],
      },
    });
    const deep = placeFixture({ ...BATH, width: 36, depth: 60 }, pt(18, 30), ctx);
    expect(deep?.value?.data).toMatchObject({
      attributes: { drain: { type: 'linear', side: 1, offset: 0, length: 60 } },
    });
  });

  it('the front faces the chosen direction', () => {
    const ctx = { level: F1, objects: [], newId: idSeq(1) };
    const right = placeFixture({ ...BATH, facing: 'right' }, pt(0, 0), ctx);
    expect(right?.value?.data).toMatchObject({
      geometry: { footprint: [pt(18, -30), pt(18, 30), pt(-18, 30), pt(-18, -30)] },
    });
  });

  it('AC-3 dragging the shower moves its footprint and keeps its frame attributes; Delete removes it', async () => {
    const { controller, send, parsed, store } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(BATH);
    send(ev('down', 30, 18));
    controller.selectTool(null);
    controller.startDrag([uid(100)], pt(30, 18));
    controller.dragPointer(ev('move', 54, 18));
    controller.dragPointer(ev('up', 54, 18));
    expect(parsed(uid(100))?.data).toEqual({
      geometry: { footprint: [pt(24, 0), pt(84, 0), pt(84, 36), pt(24, 36)] },
      status: 'existing',
      level: F1,
      attributes: BATH_ATTRIBUTES,
    });
    expect(controller.getUi().utilities).toBeNull();
    store.applyEdit(deleteChanges(store.getState().objects, F1, [uid(100)], idSeq(200)));
    expect(store.getState().objects.has(uid(100))).toBe(false);
  });
});
