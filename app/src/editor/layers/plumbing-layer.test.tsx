// EZD-729 AC-EZD-729-1: a placed sink gets supply and drain locations that show on the Plumbing layer and hide when
// the layer is off. Expected values from the spec and the recorded layout, never the code: S03 "Layers tab sections:
// Phase, Overlays, Rooms" and board S03Plan (an Overlays heading, rows with an eye); S03 Decisions (a lock icon on
// each layer row); 00g "Layer" (drawn only when every layer it is in is shown); vault/build/assumptions.md EZD-729
// (hot, drain and cold on the back edge, 8" apart, each the EZD-234 6" diamond). By hand: the Sink's panel size is
// 33" × 22" (EZD-234), so a sink placed at (100, 50) facing down has its back edge on y = 61 and its locations at
// (92, 61), (100, 61) and (108, 61); each diamond's right corner is 3" right of its point. Phase view Existing, so
// the sink is Existing (EZD-234 placement status) and shown (Q-0667).
import {
  CURRENT_SCHEMA_VERSION,
  PLUMBING_LOCATION_TYPE,
  type ObjectStatus,
  type Point,
} from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../model/model-store';
import { planAnnotation, planDrawingList } from '../plan/batches';
import { createPickIndex } from '../selection/pick-index';
import { fixtureChoice, placeFixture } from '../tools/fixture-tool';
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
  dimensions: false, // EZD-216: the Dimensions layer
};

function phase(): LayerPhase {
  const eyes: PhaseEyes = eyeDefaults('existing');
  return {
    get: () => ({ eyes }),
    version: () => 0,
    setEye: (_s: ObjectStatus, _on: boolean) => {},
    subscribe: () => () => {},
  };
}

const SINK = uid(1);

function withSink(): Map<string, ObjectValue> {
  const change = placeFixture(fixtureChoice('sink'), { x: 100, y: 50 }, {
    level: F1,
    objects: [],
    newId: idSeq(1),
  });
  expect(change).not.toBeNull();
  return applyChanges(baseObjects(), [change!]);
}

function withPoint(
  objects: Map<string, ObjectValue>,
  n: number,
  kind: 'water' | 'drain' | 'gas',
  at: Point,
): Map<string, ObjectValue> {
  objects.set(uid(n), {
    type: 'utility_point',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: at },
      status: 'existing',
      level: F1,
      attributes: { kind, volts: null, amps: null, servesObjectId: null },
    },
  });
  return objects;
}

// The sink's plan lines: its outline and its two bowls (12; EZD-422), and four per drawn location.
function sinkLines(objects: Map<string, ObjectValue>, layers: ReturnType<typeof createLayerSetting>) {
  return planDrawingList(objects, {}, layers, null)!.items.flatMap((i) =>
    i.objectId.toLowerCase() === SINK && i.kind === 'line' ? [i] : [],
  );
}

describe('EZD-729 Plumbing layer rules', () => {
  it('a plumbing location, a water point and a drain point are in Plumbing and their Phase layer', () => {
    expect(objectLayers(PLUMBING_LOCATION_TYPE, 'new')).toEqual(['new', 'plumbing']);
    expect(objectLayers('utility_point', 'existing', 'water')).toEqual(['existing', 'plumbing']);
    expect(objectLayers('utility_point', 'existing', 'drain')).toEqual(['existing', 'plumbing']);
    expect(objectLayers('utility_point', 'existing', 'gas')).toEqual(['existing']);
    expect(objectLayers('utility_point', 'existing', 'electric')).toEqual(['existing']);
    expect(objectLayers('fixture', 'existing', 'sink')).toEqual(['existing']);
  });

  it('AC-1 a plumbing location is drawn only when the Plumbing eye and its Phase eye are on', () => {
    expect(objectVisible(ALL_ON, true, PLUMBING_LOCATION_TYPE, 'new', undefined, true)).toBe(true);
    expect(objectVisible(ALL_ON, true, PLUMBING_LOCATION_TYPE, 'new', undefined, false)).toBe(false);
    expect(
      objectVisible({ ...ALL_ON, new: false }, true, PLUMBING_LOCATION_TYPE, 'new', undefined, true),
    ).toBe(false);
    expect(objectVisible(ALL_ON, true, 'fixture', 'new', 'sink', false)).toBe(true);
  });

  it('the Plumbing lock limits selecting water and drain points only', () => {
    const locked = { ...UNLOCKED, plumbing: true };
    expect(objectSelectable(locked, 'utility_point', 'existing', 'water')).toBe(false);
    expect(objectSelectable(locked, 'utility_point', 'existing', 'gas')).toBe(true);
    expect(objectSelectable(locked, 'fixture', 'existing', 'sink')).toBe(true);
  });

  it('a new store has the Plumbing eye on; setPlumbingEye tells listeners once per change', () => {
    const layers = createLayerSetting(phase());
    expect(layers.get().plumbingEye).toBe(true);
    let told = 0;
    layers.subscribe(() => (told += 1));
    const v0 = layers.version();
    layers.setPlumbingEye(false);
    layers.setPlumbingEye(false);
    expect(told).toBe(1);
    expect(layers.version()).not.toBe(v0);
    expect(layers.get().plumbingEye).toBe(false);
    expect(layers.get().roomsEye).toBe(true);
  });
});

describe('EZD-729 a placed sink on the plan', () => {
  it('AC-1 the sink draws hot, drain and cold diamonds on its back edge while Plumbing is shown', () => {
    const objects = withSink();
    const layers = createLayerSetting(phase());
    const lines = sinkLines(objects, layers);
    expect(lines).toHaveLength(12 + 3 * 4);
    const from = lines.map((l) => l.from);
    for (const corner of [
      { x: 95, y: 61 },
      { x: 103, y: 61 },
      { x: 111, y: 61 },
    ])
      expect(from).toContainEqual(corner);
  });

  it('AC-1 Plumbing off hides the locations and keeps the sink; on again shows them', () => {
    const objects = withSink();
    const layers = createLayerSetting(phase());
    expect(sinkLines(objects, layers)).toHaveLength(24);
    layers.setPlumbingEye(false);
    expect(sinkLines(objects, layers)).toHaveLength(12);
    expect(sinkLines(objects, layers).map((l) => l.from)).not.toContainEqual({ x: 103, y: 61 });
    layers.setPlumbingEye(true);
    expect(sinkLines(objects, layers)).toHaveLength(24);
  });

  it('Plumbing off hides water and drain points, not a gas point; the pick index leaves them out', () => {
    const objects = withPoint(
      withPoint(withPoint(withSink(), 11, 'water', { x: 30, y: 30 }), 12, 'drain', { x: 40, y: 30 }),
      13,
      'gas',
      { x: 50, y: 30 },
    );
    const layers = createLayerSetting(phase());
    const drawn = () =>
      new Set(planDrawingList(objects, {}, layers, null)!.items.map((i) => i.objectId.toLowerCase()));
    expect([uid(11), uid(12), uid(13)].every((id) => drawn().has(id))).toBe(true);
    layers.setPlumbingEye(false);
    expect(drawn().has(uid(11))).toBe(false);
    expect(drawn().has(uid(12))).toBe(false);
    expect(drawn().has(uid(13))).toBe(true);

    const pick = createPickIndex();
    pick.sync(objects, F1, [], layers.selectable);
    expect(pick.has(uid(11))).toBe(false);
    expect(pick.has(uid(13))).toBe(true);
    expect(pick.has(SINK)).toBe(true);
  });
});

describe('EZD-729 left panel Plumbing row', () => {
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

  it('Layers shows an Overlays heading between Phase and Rooms, with a Plumbing row, its lock and eye', () => {
    const layers = createLayerSetting(phase());
    const html = render(layers);
    const phaseAt = html.indexOf('>Phase<');
    const overlaysAt = html.indexOf('>Overlays<');
    const roomsAt = html.indexOf('data-testid="layer-row-rooms"');
    expect(phaseAt).toBeGreaterThan(-1);
    expect(overlaysAt).toBeGreaterThan(phaseAt);
    expect(roomsAt).toBeGreaterThan(overlaysAt);
    const rows = elements(html, 'layer-row-plumbing');
    expect(rows).toHaveLength(1);
    expect(textOf(rows[0]!.inner)).toBe('Plumbing');
    const eye = elements(html, 'layer-eye-plumbing')[0]!;
    expect(attr(eye.attrs, 'aria-label')).toBe('Hide Plumbing');
    expect(attr(eye.attrs, 'data-on')).toBe('true');
    const lock = elements(html, 'layer-lock-plumbing')[0]!;
    expect(attr(lock.attrs, 'aria-label')).toBe('Lock Plumbing');
  });

  it('AC-1 with Plumbing off the row reads Show Plumbing and its eye is off', () => {
    const layers = createLayerSetting(phase());
    layers.setPlumbingEye(false);
    const eye = elements(render(layers), 'layer-eye-plumbing')[0]!;
    expect(attr(eye.attrs, 'aria-label')).toBe('Show Plumbing');
    expect(attr(eye.attrs, 'data-on')).toBe('false');
    expect(eye.inner).toContain('#ez-icon-visibility_off"');
  });
});

// EZD-2043 AC-EZD-2043-2 (Q-0920): the canvas draws a utility point's symbol at the same size relative to the plan as
// a sheet. By hand: a gas point at (30, 30) is a circle of radius 3 with "G" 4.5" tall; the canvas draws text at 0.5"
// of plan a point at every plan scale (glyph-atlas PT_TO_MODEL_IN), so "G" is 4.5 / 0.5 = 9 pt; a sheet (no
// annotation given) draws it at 4.5 / (12 / 18) = 6.75 pt.
describe('EZD-2043 a utility point on the canvas', () => {
  it('draws its circle and letter at the plan annotation scale', () => {
    const objects = withPoint(baseObjects(), 21, 'gas', { x: 30, y: 30 });
    const items = (options: Parameters<typeof planDrawingList>[1]) =>
      planDrawingList(objects, options, null, null)!.items.filter((i) => i.objectId.toLowerCase() === uid(21));
    const canvas = items({ annotation: planAnnotation(48) });
    expect(canvas.map((i) => i.kind)).toEqual(['arc', 'text']);
    const [ring, letter] = canvas;
    if (ring?.kind !== 'arc' || letter?.kind !== 'text') throw new Error('not a circle and a letter');
    expect([ring.center, ring.radius, ring.layer]).toEqual([{ x: 30, y: 30 }, 3, 'existing']);
    expect([letter.text, letter.sizePt, letter.at]).toEqual(['G', 9, { x: 30, y: 30 }]);
    const sheet = items({});
    expect(sheet[0]).toEqual(ring);
    expect(sheet[1]?.kind === 'text' ? sheet[1].sizePt : null).toBe(6.75);
  });
});
