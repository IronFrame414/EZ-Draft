// EZD-6001 U9 (vault/plans/EZD-6001.md section 4; Decided D-Wire; AC-EZD-6001-1; ARCH Selection "open floor"):
// a floor switch empties the selection and Select all then picks the open floor's objects only. Real model store
// over the P210a fixtures; the canvas handle is a local fake.
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createFloorView } from '../floors/floors';
import { createModelStore } from '../model/model-store';
import { baseObjects, F1, F2, uid, withWalls } from '../tools/test-utils/fixtures';
import { createSelectionController, type SelectionDeps } from './selection-controller';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });

describe('EZD-6001 selection floors', () => {
  it('EZD-6001 U9 a switch empties the selection; Select all picks the open floor only', () => {
    let objects: Map<string, ObjectValue> = baseObjects();
    objects.set(F2, {
      type: 'floor',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { name: 'Floor 2', order: 2 },
    });
    objects = withWalls(objects, 1, [pt(0, 0), pt(144, 0)], false, 'center', F1);
    objects = withWalls(objects, 2, [pt(0, 200), pt(144, 200)], false, 'center', F2);
    const store = createModelStore({ objects });
    const floors = createFloorView();
    const selected: Array<readonly string[]> = [];
    const handle: SelectionDeps['handle'] = {
      getPixelsPerInch: () => PPI,
      screenToModel: (s) => ({ x: s.x / PPI, y: -s.y / PPI }),
      setHoverMode: () => {},
      setHoverPicker: () => {},
      setBodyLookup: () => {},
      setSelectedIds: (ids) => void selected.push([...ids]),
    };
    const controller = createSelectionController({
      handle,
      store,
      drawing: null,
      setReceiver: () => {},
      floors,
    });
    controller.select([uid(1)]);
    expect(controller.getUi().ids).toEqual([uid(1)]);
    floors.setOpenFloor(F2);
    expect(controller.getUi().ids).toEqual([]);
    expect(selected.at(-1)).toEqual([]);
    controller.selectAll();
    expect(controller.getUi().ids).toEqual([uid(2)]);
    controller.dispose();
  });
});
