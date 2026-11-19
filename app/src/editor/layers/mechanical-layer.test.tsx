// EZD-731 AC-EZD-731-1: placed equipment and registers show on the Mechanical layer and hide when the layer is off.
// Expected values from the spec and the recorded layout, never the code: phase-07 EZD-731 ("equipment ... and
// registers as model objects on a Mechanical layer"); S03 "Layers tab sections: Phase, Overlays, Rooms" and board
// S03Plan (Overlays rows with an eye and a lock); 00g "Layer" (drawn only when every layer it is in is shown);
// vault/build/assumptions.md EZD-731 (condenser 30" × 30" drawn as its outline with "CU" at the centre; supply register
// 10" × 4", its outline with both diagonals, as EZD-229). By hand: a condenser placed at (100, 50) has corners
// (85, 35), (115, 35), (115, 65), (85, 65): four lines and one text; a supply register at (200, 50) has four outline
// lines and two diagonals.
import { type ObjectStatus } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { PhaseEyes } from '../../lib/plan/phase-view';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { planDetailItems } from '../../lazy/room-fields/details-drawing';
import { createModelStore } from '../model/model-store';
import { planDrawingList } from '../plan/batches';
import { createPickIndex } from '../selection/pick-index';
import { existingDetailChoice, mechanicalChoice, placeFixture } from '../tools/fixture-tool';
import { applyChanges, baseObjects, F1, idSeq, uid } from '../tools/test-utils/fixtures';
import {
  createLayerSetting,
  objectLayers,
  objectSelectable,
  objectVisible,
  type LayerLocks,
  type LayerPhase,
} from './layer-setting';
import { LeftPanel } from './LeftPanel';

const ALL_ON: PhaseEyes = { existing: true, demo: true, new: true };
const UNLOCKED: LayerLocks = {
  existing: false,
  demo: false,
  new: false,
  rooms: false,
  plumbing: false,
  mechanical: false,
};

function phase(): LayerPhase {
  return {
    get: () => ({ eyes: ALL_ON }),
    version: () => 0,
    setEye: (_s: ObjectStatus, _on: boolean) => {},
    subscribe: () => () => {},
  };
}

const CONDENSER = uid(1);
const SUPPLY = uid(2);
const OLD_RETURN = uid(3);

// A New condenser and a New supply register placed from the Fixtures panel, and an Existing return register
// placed as an existing detail (EZD-229).
function placed(): Map<string, ObjectValue> {
  const ctx = { level: F1, objects: [], status: 'new' as const };
  const changes = [
    placeFixture(mechanicalChoice('condenser'), { x: 100, y: 50 }, { ...ctx, newId: idSeq(1) }),
    placeFixture(mechanicalChoice('supply'), { x: 200, y: 50 }, { ...ctx, newId: idSeq(2) }),
    placeFixture(existingDetailChoice('return'), { x: 300, y: 50 }, { ...ctx, newId: idSeq(3) }),
  ];
  for (const c of changes) expect(c).not.toBeNull();
  return applyChanges(baseObjects(), changes.map((c) => c!));
}

function itemsOf(
  objects: Map<string, ObjectValue>,
  layers: ReturnType<typeof createLayerSetting>,
  id: string,
) {
  return planDrawingList(objects, { extraItems: planDetailItems }, layers, null)!.items.filter(
    (i) => i.objectId.toLowerCase() === id,
  );
}

describe('EZD-731 Mechanical layer rules', () => {
  it('every hvac object is in Mechanical and its Phase layer, whatever its kind', () => {
    for (const kind of ['air_handler', 'condenser', 'supply', 'return'])
      expect(objectLayers('hvac', 'new', kind)).toEqual(['new', 'mechanical']);
    expect(objectLayers('hvac', 'existing', 'return')).toEqual(['existing', 'mechanical']);
    expect(objectLayers('fixture', 'new', 'water_heater')).toEqual(['new']);
    expect(objectLayers('utility_point', 'new', 'water')).toEqual(['new', 'plumbing']);
  });

  it('AC-1 an hvac object is drawn only when the Mechanical eye and its Phase eye are on', () => {
    expect(objectVisible(ALL_ON, true, 'hvac', 'new', 'condenser', true, true)).toBe(true);
    expect(objectVisible(ALL_ON, true, 'hvac', 'new', 'condenser', true, false)).toBe(false);
    expect(objectVisible({ ...ALL_ON, new: false }, true, 'hvac', 'new', 'supply', true, true)).toBe(
      false,
    );
    expect(objectVisible(ALL_ON, true, 'fixture', 'new', 'sink', true, false)).toBe(true);
    expect(objectVisible(ALL_ON, true, 'hvac', 'new', 'supply', false, true)).toBe(true);
  });

  it('the Mechanical lock stops selecting hvac objects only', () => {
    const locked = { ...UNLOCKED, mechanical: true };
    expect(objectSelectable(locked, 'hvac', 'new', 'air_handler')).toBe(false);
    expect(objectSelectable(locked, 'fixture', 'new', 'sink')).toBe(true);
    expect(objectSelectable(UNLOCKED, 'hvac', 'new', 'air_handler')).toBe(true);
  });

  it('a new store has the Mechanical eye on; setMechanicalEye tells listeners once per change', () => {
    const layers = createLayerSetting(phase());
    expect(layers.get().mechanicalEye).toBe(true);
    let told = 0;
    layers.subscribe(() => (told += 1));
    const v0 = layers.version();
    layers.setMechanicalEye(false);
    layers.setMechanicalEye(false);
    expect(told).toBe(1);
    expect(layers.version()).not.toBe(v0);
    expect(layers.get().mechanicalEye).toBe(false);
    expect(layers.get().plumbingEye).toBe(true);
    expect(layers.get().roomsEye).toBe(true);
  });
});

describe('EZD-731 placed equipment and registers on the plan', () => {
  it('AC-1 the condenser draws its outline and CU; the supply register its outline and both diagonals', () => {
    const objects = placed();
    const layers = createLayerSetting(phase());
    const cu = itemsOf(objects, layers, CONDENSER);
    const lines = cu.filter((i) => i.kind === 'line');
    expect(lines).toHaveLength(4);
    const from = lines.map((l) => (l.kind === 'line' ? l.from : null));
    for (const corner of [
      { x: 85, y: 35 },
      { x: 115, y: 35 },
      { x: 115, y: 65 },
      { x: 85, y: 65 },
    ])
      expect(from).toContainEqual(corner);
    const texts = cu.filter((i) => i.kind === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.kind === 'text' && texts[0]!.text).toBe('CU');
    expect(texts[0]!.kind === 'text' && texts[0]!.at).toEqual({ x: 100, y: 50 });
    expect(cu.every((i) => i.layer === 'new')).toBe(true);
    expect(itemsOf(objects, layers, SUPPLY).filter((i) => i.kind === 'line')).toHaveLength(6);
  });

  it('AC-1 Mechanical off hides the equipment and the registers, New and Existing; on again shows them', () => {
    const objects = placed();
    const layers = createLayerSetting(phase());
    expect(itemsOf(objects, layers, CONDENSER)).toHaveLength(5);
    expect(itemsOf(objects, layers, SUPPLY)).toHaveLength(6);
    expect(itemsOf(objects, layers, OLD_RETURN)).toHaveLength(5);
    layers.setMechanicalEye(false);
    expect(itemsOf(objects, layers, CONDENSER)).toHaveLength(0);
    expect(itemsOf(objects, layers, SUPPLY)).toHaveLength(0);
    expect(itemsOf(objects, layers, OLD_RETURN)).toHaveLength(0);
    layers.setMechanicalEye(true);
    expect(itemsOf(objects, layers, CONDENSER)).toHaveLength(5);
    expect(itemsOf(objects, layers, SUPPLY)).toHaveLength(6);
  });

  it('Mechanical off or locked leaves them out of the pick index', () => {
    const objects = placed();
    const layers = createLayerSetting(phase());
    const pick = createPickIndex();
    pick.sync(objects, F1, [], layers.selectable);
    expect(pick.has(CONDENSER)).toBe(true);
    expect(pick.has(SUPPLY)).toBe(true);
    layers.setLock('mechanical', true);
    pick.sync(objects, F1, [], layers.selectable);
    expect(pick.has(CONDENSER)).toBe(false);
    expect(pick.has(SUPPLY)).toBe(false);
    expect(itemsOf(objects, layers, CONDENSER)).toHaveLength(5);
    layers.setLock('mechanical', false);
    layers.setMechanicalEye(false);
    pick.sync(objects, F1, [], layers.selectable);
    expect(pick.has(CONDENSER)).toBe(false);
  });
});

describe('EZD-731 left panel Mechanical row', () => {
  const render = (layers: ReturnType<typeof createLayerSetting>) => {
    const store = createModelStore({ objects: baseObjects() });
    const ui = { ids: [] as string[], selectMore: false };
    return renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
        <LeftPanel
          store={store}
          layers={layers}
          selection={{ getUi: () => ui, subscribe: () => () => {}, select: () => {} }}
          showObject={() => true}
          canEdit
        />
      </MessagesProvider>,
    );
  };

  it('Overlays has a Mechanical row after Plumbing and before Rooms, with its lock and eye', () => {
    const html = render(createLayerSetting(phase()));
    const overlaysAt = html.indexOf('>Overlays<');
    const plumbingAt = html.indexOf('data-testid="layer-row-plumbing"');
    const mechanicalAt = html.indexOf('data-testid="layer-row-mechanical"');
    const roomsAt = html.indexOf('data-testid="layer-row-rooms"');
    expect(overlaysAt).toBeGreaterThan(-1);
    expect(plumbingAt).toBeGreaterThan(overlaysAt);
    expect(mechanicalAt).toBeGreaterThan(plumbingAt);
    expect(roomsAt).toBeGreaterThan(mechanicalAt);
    const rows = elements(html, 'layer-row-mechanical');
    expect(rows).toHaveLength(1);
    expect(textOf(rows[0]!.inner)).toBe('Mechanical');
    const eye = elements(html, 'layer-eye-mechanical')[0]!;
    expect(attr(eye.attrs, 'aria-label')).toBe('Hide Mechanical');
    expect(attr(eye.attrs, 'data-on')).toBe('true');
    const lock = elements(html, 'layer-lock-mechanical')[0]!;
    expect(attr(lock.attrs, 'aria-label')).toBe('Lock Mechanical');
  });

  it('AC-1 with Mechanical off the row reads Show Mechanical and its eye is off', () => {
    const layers = createLayerSetting(phase());
    layers.setMechanicalEye(false);
    const eye = elements(render(layers), 'layer-eye-mechanical')[0]!;
    expect(attr(eye.attrs, 'aria-label')).toBe('Show Mechanical');
    expect(attr(eye.attrs, 'data-on')).toBe('false');
  });
});
