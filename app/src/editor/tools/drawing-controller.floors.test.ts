// EZD-6001 U10, U11 (vault/plans/EZD-6001.md section 4; Decided D-Wire, D-Draw-switch; AC-EZD-6001-1; 03f every
// object has one `level`): a wall drawn while Floor 2 is open is on Floor 2; a switch in the middle of a chain ends
// the chain as Escape does and keeps the Wall tool. Real model store over the P210a fixtures; a local fake handle.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createFloorView } from '../floors/floors';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { createDrawingController, type DrawingHandle } from './drawing-controller';
import { baseObjects, F2, idSeq, wallsOf, WHEN, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });

function setup() {
  const objects: Map<string, ObjectValue> = baseObjects();
  objects.set(F2, {
    type: 'floor',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: { name: 'Floor 2', order: 2 },
  });
  const store = createModelStore({ objects });
  const floors = createFloorView();
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
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: () => {},
    newId: idSeq(100),
    now: () => WHEN,
    floors,
  });
  const send = (kind: PlanPointerEvent['kind'], x: number, y: number) => {
    if (receiver === null) throw new Error('no pointer receiver set');
    receiver({
      kind,
      model: pt(x, y),
      screen: toScreen(pt(x, y)),
      pointerType: 'mouse',
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });
  };
  const click = (x: number, y: number) => {
    send('down', x, y);
    send('up', x, y);
  };
  return { store, floors, controller, send, click };
}

describe('EZD-6001 drawing floors', () => {
  it('EZD-6001 U10 a wall drawn with Floor 2 open is on Floor 2', () => {
    const { store, floors, controller, click } = setup();
    floors.setOpenFloor(F2);
    controller.selectTool('wall');
    click(0, 0);
    click(120, 0);
    const walls = wallsOf(store.getState().objects);
    expect(walls).toHaveLength(1);
    expect(walls[0]!.data.level).toBe(F2);
    controller.dispose();
  });

  it('EZD-6001 U11 a switch mid-chain ends the chain and keeps the Wall tool', () => {
    const { store, floors, controller, send, click } = setup();
    controller.selectTool('wall');
    click(0, 0);
    send('move', 60, 0);
    // The rubber band runs from the chain's start; after the switch no chain is started.
    expect(controller.getFrame()?.from).toEqual(pt(0, 0));
    floors.setOpenFloor(F2);
    expect(controller.getFrame()?.from ?? null).toBeNull();
    expect(controller.getUi().tool).toBe('wall');
    expect(store.getState().past).toHaveLength(0);
    controller.dispose();
  });
});
