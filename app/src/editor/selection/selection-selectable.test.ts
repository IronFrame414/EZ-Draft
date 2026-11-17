// EZD-5605 T17 (vault/plans/EZD-5605.md section 4; D-Selectable; Q-0641 row 56-4; AC-EZD-5605-8): while an Assistant
// preview is adjusted, pick, Select more, Select all and the box reach preview objects only, a group included; after
// Adjust ends every object is reached again. A real selection controller on the routed store, as the editor wires it.
// Fixture: three walls uid(1) (0,0)-(144,0), uid(2) (144,0)-(144,120), uid(3) (144,120)-(0,120); 1 and 2 grouped; the
// preview changes uid(1) only.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createAdjustController } from '../assistant/adjust';
import { touchedIds, type OkPreview } from '../assistant/apply-reply';
import { createPreviewStore } from '../assistant/preview-store';
import { createModelStore } from '../model/model-store';
import { createRoutedStore } from '../model/routed-store';
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
  const objects = withWalls(
    baseObjects(),
    1,
    [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)],
    false,
  );
  objects.set(uid(90), {
    type: 'group',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: { level: F1, memberIds: [uid(1), uid(2)] },
  });
  const model = createModelStore({ objects });
  const routed = createRoutedStore(model);
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
    store: routed,
    drawing: null,
    setReceiver: (r) => void (receiver = r),
  });
  const w1 = objects.get(uid(1))!;
  const data = w1.data as { attributes: Record<string, unknown> };
  const changes = [
    {
      id: uid(1),
      value: { ...w1, data: { ...data, attributes: { ...data.attributes, height: 100 } } },
    },
  ];
  const preview: OkPreview = {
    ok: true,
    changes,
    added: [],
    removed: [],
    updated: [uid(1)],
    touched: touchedIds(objects, changes),
    provisional: {},
  };
  const previews = createPreviewStore({ store: model });
  previews.open({ preview, prompt: 'p', entryId: 1, before: model.getState().objects });
  const adjust = createAdjustController({ model, routed, previews, selection, drawing: null });
  const click = (at: Point, shift = false) => {
    receiver!(ev('down', at, shift));
    receiver!(ev('up', at, shift));
  };
  const box = (from: Point, to: Point) => {
    receiver!(ev('down', from));
    receiver!(ev('move', to));
    receiver!(ev('up', to));
  };
  const ids = () => selection.getUi().ids;
  return { selection, adjust, previews, click, box, ids };
}

describe('EZD-5605 selection during Adjust', () => {
  it('T17 pick, group, Select more, Select all and the box reach preview objects only', () => {
    const s = setup();
    expect(s.adjust.start()).toBe(true);
    s.click(pt(72, 120));
    expect(s.ids()).toEqual([]);
    s.click(pt(72, 0));
    expect(s.ids()).toEqual([uid(1)]);
    s.selection.clear();
    s.selection.setSelectMore(true);
    s.click(pt(72, 120));
    s.click(pt(72, 0));
    expect(s.ids()).toEqual([uid(1)]);
    s.selection.setSelectMore(false);
    s.selection.clear();
    s.selection.selectAll();
    expect(s.ids()).toEqual([uid(1)]);
    s.selection.clear();
    s.box(pt(-20, 140), pt(170, -20));
    expect(s.ids()).toEqual([uid(1)]);
    s.selection.select([uid(2), uid(3)]);
    expect(s.ids()).toEqual([]);
  });

  it('T17 after Adjust ends every object is reached as before', () => {
    const s = setup();
    s.adjust.start();
    s.previews.reject();
    s.click(pt(72, 0));
    expect(s.ids()).toEqual([uid(1), uid(2)]);
    s.selection.selectAll();
    expect(s.ids()).toEqual(expect.arrayContaining([uid(1), uid(2), uid(3)]));
  });
});
