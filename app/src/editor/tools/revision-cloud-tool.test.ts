// EZD-232 (AC-EZD-232-1; S03 rail "Revision cloud | Draw a cloud and delta tag manually"; 04 Tool rail "Revision cloud
// | Q | Plan, Sheets"; Q-0200 "clouds can also be added or removed by hand"; gesture and sizes:
// vault/build/assumptions/EZD-232.md): the Revision cloud tool's steps, and through the drawing controller a drawn
// cloud stored as a manual `revision_cloud` on the open floor, selected, undoable and deleted with Delete.
import { describe, expect, it, vi } from 'vitest';
import {
  parseStoredObject,
  type Point,
  type RevisionCloudData,
  type SnapSettings,
} from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { PhaseSource } from '../../lib/plan/phase-view';
import { deleteChanges } from '../edit/edit-changes';
import { objectLayers } from '../layers/layer-setting';
import {
  createDrawingController,
  type DrawingHandle,
  type SelectionLink,
  type ToolKeyEvent,
} from './drawing-controller';
import {
  CLOUD_DRAG_PX,
  initialCloudState,
  rectCloudData,
  reduceCloud,
  type CloudToolState,
} from './revision-cloud-tool';
import { DRAWING_RAIL_TOOLS } from './tool-defs';
import { toolForKey } from './rail-mode';
import { baseObjects, F1, uid, WHO } from './test-utils/fixtures';

const pt = (x: number, y: number): Point => ({ x, y });
const PPI = 8 / 3;
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const SNAP_OFF: SnapSettings = {
  endpoints: false,
  midpoints: false,
  faces: false,
  angles: false,
  increment: false,
  incrementIn: 1,
};

// A cloud from (12, 24) to (108, 96): counter-clockwise from the lower left, the tag on the top right corner.
const EXPECTED: RevisionCloudData = {
  geometry: {
    boundary: [pt(12, 24), pt(108, 24), pt(108, 96), pt(12, 96)],
    tag: pt(108, 96),
  },
  level: F1,
  attributes: { source: 'manual', rev: null },
};

describe('EZD-232 Revision cloud tool steps', () => {
  const down = (p: Point, screen = toScreen(p)) => ({ type: 'down', at: p, screen }) as const;
  const up = (p: Point, screen = toScreen(p)) => ({ type: 'up', at: p, screen }) as const;

  it('a press, a drag and the lift place a rectangle cloud between the two corners', () => {
    let s: CloudToolState = reduceCloud(initialCloudState(), down(pt(108, 24)), F1).state;
    s = reduceCloud(s, { type: 'move', at: pt(60, 60) }, F1).state;
    expect(s.at).toEqual(pt(60, 60));
    const step = reduceCloud(s, up(pt(12, 96)), F1);
    expect(step.place).toEqual(EXPECTED);
    expect(step.state).toEqual(initialCloudState());
    expect(step.exit).toBe(false);
  });

  it('a click sets the first corner and the next click the other one', () => {
    let s = reduceCloud(initialCloudState(), down(pt(12, 24)), F1).state;
    // Lifted less than CLOUD_DRAG_PX away: a click.
    const near = toScreen(pt(12, 24));
    let step = reduceCloud(s, up(pt(12, 24), { x: near.x + CLOUD_DRAG_PX - 1, y: near.y }), F1);
    expect(step.place).toBeNull();
    s = step.state;
    expect(s.corner?.at).toEqual(pt(12, 24));
    s = reduceCloud(s, down(pt(108, 96)), F1).state;
    step = reduceCloud(s, up(pt(108, 96)), F1);
    expect(step.place).toEqual(EXPECTED);
  });

  it('a cloud under 1" either way is not placed; the tool starts again', () => {
    const s = reduceCloud(initialCloudState(), down(pt(0, 0)), F1).state;
    const step = reduceCloud(s, up(pt(200, 0.5)), F1);
    expect(step.place).toBeNull();
    expect(step.state).toEqual(initialCloudState());
    expect(rectCloudData(pt(0, 0), pt(1, 1), F1)).not.toBeNull();
    expect(rectCloudData(pt(0, 0), pt(0.99, 50), F1)).toBeNull();
  });

  it('Esc drops a started cloud, then ends the tool', () => {
    const s = reduceCloud(initialCloudState(), down(pt(0, 0)), F1).state;
    const first = reduceCloud(s, { type: 'escape' }, F1);
    expect(first.state).toEqual(initialCloudState());
    expect(first.exit).toBe(false);
    expect(reduceCloud(first.state, { type: 'escape' }, F1).exit).toBe(true);
  });

  it('what it places is a valid stored revision_cloud', () => {
    const r = parseStoredObject({
      id: uid(900),
      type: 'revision_cloud',
      schema_version: 7,
      data: EXPECTED,
    });
    expect(r.ok).toBe(true);
  });
});

describe('EZD-232 Revision cloud on the rail', () => {
  it('is a rail tool with the Q key, after Sketch', () => {
    const ids = DRAWING_RAIL_TOOLS.map((t) => (t.kind === 'tool' ? t.id : null));
    expect(ids.indexOf('revision-cloud')).toBe(ids.indexOf('sketch') + 1);
    const tool = DRAWING_RAIL_TOOLS.find((t) => t.kind === 'tool' && t.id === 'revision-cloud');
    expect(tool).toMatchObject({
      label: 'office.tool.revision_cloud',
      shortcut: 'Q',
      icon: 'cloud',
    });
  });

  it('Q turns it on only with Edit model', () => {
    const e = key('q');
    expect(toolForKey(e, true)).toBe('revision-cloud');
    expect(toolForKey(e, false)).toBeNull();
  });
});

function ev(kind: PlanPointerEvent['kind'], p: Point, pointerType = 'mouse'): PlanPointerEvent {
  return {
    kind,
    model: p,
    screen: toScreen(p),
    pointerType,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function key(k: string): ToolKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target: null,
  };
}

function setup(canEdit = true) {
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
  const phase: PhaseSource = {
    version: () => 0,
    shown: () => true,
    subscribe: () => () => {},
    newObjectStatus: () => 'new',
  };
  let ids: string[] = [];
  const link: SelectionLink = {
    getUi: () => ({ ids }) as unknown as ReturnType<SelectionLink['getUi']>,
    select: vi.fn((next: readonly string[]) => void (ids = [...next])),
    subscribe: () => () => {},
  };
  let n = 0;
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: () => {},
    snapSettings: () => SNAP_OFF,
    newId: () => uid(500 + n++),
    phase,
  });
  controller.attachSelection(link);
  const send = (e: PlanPointerEvent) => receiver?.(e);
  const clouds = () =>
    [...store.getState().objects]
      .filter(([, v]) => v.type === 'revision_cloud')
      .map(([id, v]) => ({ id, data: v.data as RevisionCloudData }));
  return { store, controller, send, clouds, link };
}

describe('EZD-232 Revision cloud through the drawing controller', () => {
  it('Q, then a drag on the plan stores a manual cloud on the open floor and selects it', () => {
    const t = setup();
    expect(t.controller.keyDown(key('q'))).toBe(true);
    expect(t.controller.getUi().tool).toBe('revision-cloud');
    t.send(ev('move', pt(12, 24)));
    t.send(ev('down', pt(12, 24)));
    t.send(ev('move', pt(108, 96)));
    // The preview is the rectangle from the first corner to the pointer.
    expect(t.controller.getFrame()).toMatchObject({
      rect: true,
      from: pt(12, 24),
      to: pt(108, 96),
    });
    t.send(ev('up', pt(108, 96)));
    const c = t.clouds();
    expect(c).toHaveLength(1);
    expect(c[0]!.data).toEqual(EXPECTED);
    expect(t.store.getState().objects.get(c[0]!.id)?.schemaVersion).toBe(7);
    expect(t.link.select).toHaveBeenLastCalledWith([c[0]!.id]);
    // The tool stays on for the next cloud.
    expect(t.controller.getUi().tool).toBe('revision-cloud');
  });

  it('two taps draw a cloud too', () => {
    const t = setup();
    t.controller.selectTool('revision-cloud');
    for (const p of [pt(12, 24), pt(108, 96)]) {
      t.send(ev('down', p, 'touch'));
      t.send(ev('up', p, 'touch'));
    }
    expect(t.clouds().map((x) => x.data)).toEqual([EXPECTED]);
  });

  it('Esc drops a started cloud, a second Esc returns to Select; undo removes a placed cloud', () => {
    const t = setup();
    t.controller.selectTool('revision-cloud');
    t.send(ev('down', pt(12, 24)));
    t.send(ev('up', pt(12, 24)));
    expect(t.controller.keyDown(key('Escape'))).toBe(true);
    t.send(ev('down', pt(108, 96)));
    t.send(ev('up', pt(108, 96)));
    expect(t.clouds()).toHaveLength(0);
    expect(t.controller.keyDown(key('Escape'))).toBe(true);
    expect(t.controller.keyDown(key('Escape'))).toBe(true);
    expect(t.controller.getUi().tool).toBeNull();

    t.controller.selectTool('revision-cloud');
    t.send(ev('down', pt(12, 24)));
    t.send(ev('up', pt(108, 96)));
    expect(t.clouds()).toHaveLength(1);
    t.store.undo();
    expect(t.clouds()).toHaveLength(0);
  });

  it('without Edit model the tool does not turn on', () => {
    const t = setup(false);
    t.controller.selectTool('revision-cloud');
    expect(t.controller.getUi().tool).toBeNull();
  });

  it('Q-0200: a selected cloud is removed by hand with Delete', () => {
    const t = setup();
    t.controller.selectTool('revision-cloud');
    t.send(ev('down', pt(12, 24)));
    t.send(ev('up', pt(108, 96)));
    const id = t.clouds()[0]!.id;
    const changes = deleteChanges(t.store.getState().objects, F1, [id], () => uid(800));
    expect(changes).toEqual([{ id, value: null }]);
  });

  it('is in the Dimensions layer, so its eye and lock take it', () => {
    expect(objectLayers('revision_cloud', undefined)).toEqual(['dimensions']);
  });
});
