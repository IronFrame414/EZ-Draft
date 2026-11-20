// EZD-220 (AC-EZD-220-1, -5; Q-0704 05-screens "Pins draw in the Existing view only: a type rule in EZD-214's display
// filter, with the Phase eyes still overriding"; Q-0704 03-data-model "pin ... status always existing"; S03 Decisions
// "The Phase eye toggles override the display"; vault/build/assumptions.md EZD-220 for the mark's 6" head and 4"
// stem). The pin's plan mark, the display rule through the editor's layer setting (draw, pick), and the Fixtures
// panel's pin placement. No browser, no live service.
import { CURRENT_SCHEMA_VERSION, PIN_KINDS, type Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { deleteChanges } from '../edit/edit-changes';
import { createLayerSetting } from '../layers/layer-setting';
import { createPickIndex } from '../selection/pick-index';
import { createPhaseSetting } from '../status/phase-setting';
import { pinChoice, placeFixture } from '../tools/fixture-tool';
import { baseObjects, F1, idSeq, uid } from '../tools/test-utils/fixtures';
import { openFloorId, planDrawingList } from './batches';
import { viewShowsType } from './phase-filter';

const pt = (x: number, y: number): Point => ({ x, y });
const PIN = uid(900);

function withPin(at: Point = pt(48, 30)): Map<string, ObjectValue> {
  const o = baseObjects();
  o.set(PIN, {
    type: 'pin',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: at },
      status: 'existing',
      level: F1,
      attributes: { kind: 'damage_moisture', photoFileId: null },
    },
  });
  return o;
}

const layersFor = (view: 'existing' | 'proposed') => {
  const phase = createPhaseSetting({ view, canEdit: false, save: async () => true });
  return { phase, layers: createLayerSetting(phase) };
};

const pinItems = (
  objects: Map<string, ObjectValue>,
  filter: Parameters<typeof planDrawingList>[2],
) =>
  planDrawingList(objects, {}, filter, null)!.items.filter(
    (i) => i.objectId?.toLowerCase() === PIN.toLowerCase(),
  );

describe('EZD-220 pin plan mark', () => {
  it('a round head above the point and a stem down to it, on the Existing layer', () => {
    expect(pinItems(withPin(), null)).toEqual([
      {
        layer: 'existing',
        objectId: PIN,
        kind: 'arc',
        role: 'beyond',
        center: pt(48, 40),
        radius: 6,
        startAngle: 0,
        endAngle: 360,
      },
      {
        layer: 'existing',
        objectId: PIN,
        kind: 'line',
        role: 'beyond',
        from: pt(48, 34),
        to: pt(48, 30),
      },
    ]);
  });

  it('a pin on another floor is not drawn', () => {
    const o = withPin();
    const v = o.get(PIN)!;
    o.set(PIN, { ...v, data: { ...v.data, level: uid(777) } });
    expect(pinItems(o, null)).toEqual([]);
  });
});

describe('EZD-220 AC-5 pins show in Existing and hide in Proposed; the eyes override', () => {
  it('the type rule: pins in the Existing view only; other types follow the eyes', () => {
    expect(viewShowsType('existing', 'pin')).toBe(true);
    expect(viewShowsType('proposed', 'pin')).toBe(false);
    expect(viewShowsType('proposed', 'wall')).toBe(true);
    expect(viewShowsType(undefined, 'pin')).toBe(true);
  });

  it('drawn in Existing, hidden in Proposed', () => {
    expect(pinItems(withPin(), layersFor('existing').layers)).toHaveLength(2);
    expect(pinItems(withPin(), layersFor('proposed').layers)).toEqual([]);
  });

  it('switching the View hides and shows them again', () => {
    const { phase, layers } = layersFor('existing');
    phase.setView('proposed');
    expect(pinItems(withPin(), layers)).toEqual([]);
    phase.setView('existing');
    expect(pinItems(withPin(), layers)).toHaveLength(2);
  });

  it('the Existing eye off hides them in Existing', () => {
    const { layers } = layersFor('existing');
    layers.setEye('existing', false);
    expect(pinItems(withPin(), layers)).toEqual([]);
  });

  it('a hidden pin is not picked; a shown one is', () => {
    const o = withPin();
    const shown = createPickIndex();
    shown.sync(o, openFloorId(o, null), [], layersFor('existing').layers.selectable);
    expect(shown.pick(pt(48, 40), 1)).toEqual([PIN]);
    const hidden = createPickIndex();
    hidden.sync(o, openFloorId(o, null), [], layersFor('proposed').layers.selectable);
    expect(hidden.pick(pt(48, 40), 1)).toEqual([]);
  });
});

describe('EZD-220 AC-1 placing a pin of each kind', () => {
  it('each of the six kinds places Existing with no photo, even when the View makes new objects New', () => {
    expect(PIN_KINDS).toEqual([
      'damage_moisture',
      'protect',
      'lead',
      'plumbing',
      'gas',
      'water_heater',
    ]);
    const next = idSeq(500);
    for (const kind of PIN_KINDS) {
      const change = placeFixture(pinChoice(kind), pt(10, 20), {
        level: F1,
        objects: [],
        newId: next,
        status: 'new',
      });
      expect(change?.value, kind).toEqual({
        type: 'pin',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { point: pt(10, 20) },
          status: 'existing',
          level: F1,
          attributes: { kind, photoFileId: null },
        },
      });
    }
  });
});

describe('EZD-220 AC-6 deleting a pin', () => {
  it('a selected pin is deleted by the Delete command, and nothing else changes', () => {
    expect(deleteChanges(withPin(), F1, [PIN], idSeq(800))).toEqual([{ id: PIN, value: null }]);
  });
});
