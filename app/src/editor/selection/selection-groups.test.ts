// EZD-233 (S03 Context menu "Group"; vault/build/assumptions.md EZD-233): a click on a grouped object selects every
// member of its group; Shift-click takes or drops the whole group; an ungrouped object selects alone.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { baseObjects, F1, uid, withWalls } from '../tools/test-utils/fixtures';
import { createSelectionController, type SelectionDeps } from './selection-controller';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });

function ev(kind: PlanPointerEvent['kind'], at: Point, shiftKey = false): PlanPointerEvent {
  return {
    kind,
    model: at,
    screen: { x: at.x * PPI, y: -at.y * PPI },
    pointerType: 'mouse',
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function setup() {
  // Three walls of a room: uid(1) (0,0)-(144,0), uid(2) (144,0)-(144,120), uid(3) (144,120)-(0,120); 1 and 2 grouped.
  const objects = withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], false);
  objects.set(uid(90), {
    type: 'group',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: { level: F1, memberIds: [uid(1), uid(2)] },
  });
  const store = createModelStore({ objects });
  let receiver: PlanPointerReceiver | null = null;
  const handle: SelectionDeps['handle'] = {
    getPixelsPerInch: () => PPI,
    screenToModel: (s) => ({ x: s.x / PPI, y: -s.y / PPI }),
    setHoverMode: () => {},
    setHoverPicker: () => {},
    setBodyLookup: () => {},
    setSelectedIds: () => {},
  };
  const selection = createSelectionController({
    handle,
    store,
    drawing: null,
    setReceiver: (r) => void (receiver = r),
  });
  const click = (at: Point, shift = false) => {
    receiver!(ev('down', at, shift));
    receiver!(ev('up', at, shift));
  };
  return { selection, click };
}

describe('EZD-233 groups in selection', () => {
  it('EZD-233 a click on one member selects the group', () => {
    const s = setup();
    s.click(pt(72, 0));
    expect(s.selection.getUi().ids).toEqual([uid(1), uid(2)]);
    s.click(pt(72, 120));
    expect(s.selection.getUi().ids).toEqual([uid(3)]);
  });

  it('EZD-233 Shift-click adds and drops the whole group', () => {
    const s = setup();
    s.click(pt(72, 120));
    s.click(pt(144, 60), true);
    expect([...s.selection.getUi().ids].sort()).toEqual([uid(1), uid(2), uid(3)].sort());
    s.click(pt(72, 0), true);
    expect(s.selection.getUi().ids).toEqual([uid(3)]);
  });
});
