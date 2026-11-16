// EZD-218 AC-EZD-218-1, -2, -4: the left panel's markup. Expected values from the spec and the board, never the code:
// board S03Plan (text tabs Layers and Rooms, Layers selected; Phase rows Existing, Demo, New with grey, red and blue
// dots and an eye; the Rooms section with each room's name and "165 sf"); Q-0673 (c) (no Versions tab until
// EZD-122); Q-0674 (b) (no Overlays heading while no overlay kind exists); S03 Decisions (a lock icon on each layer
// row); Q-0675 (a) (lock_open unlocked, lock locked); Q-0667 (Existing view: New hidden); 05 Q-0664 "Views and
// permissions" (a view-only user reads the room fields as plain text). Rendered in the real office catalog, English.
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { eyeDefaults, type PhaseEyes } from '../../lib/plan/phase-view';
import { createModelStore } from '../model/model-store';
import { baseObjects, roomValue, uid } from '../tools/test-utils/fixtures';
import { createLayerSetting, type LayerPhase } from './layer-setting';
import { LeftPanel, type Tab } from './LeftPanel';
import { roomAttributeChange } from './rooms';

const pt = (x: number, y: number): Point => ({ x, y });
const rect = (x: number, y: number, w: number, h: number) => [
  pt(x, y),
  pt(x + w, y),
  pt(x + w, y + h),
  pt(x, y + h),
];

function phase(): LayerPhase {
  const eyes: PhaseEyes = eyeDefaults('existing');
  return {
    get: () => ({ eyes }),
    version: () => 0,
    setEye: (_s: ObjectStatus, _on: boolean) => {},
    subscribe: () => () => {},
  };
}

function setup(o: { selected?: string[]; bath?: boolean } = {}) {
  const objects = baseObjects();
  objects.set(uid(1), roomValue(rect(0, 0, 150, 158.4), 'Kitchen', null));
  objects.set(uid(2), roomValue(rect(150, 0, 72, 76), 'Laundry', null));
  const store = createModelStore({ objects });
  if (o.bath === true) store.applyEdit([roomAttributeChange(objects, uid(1), 'roomType', 'bath')!]);
  const layers = createLayerSetting(phase());
  const ui = { ids: o.selected ?? [], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, select: () => {} };
  return { store, layers, selection };
}

function render(s: ReturnType<typeof setup>, o: { tab?: Tab; canEdit?: boolean } = {}): string {
  const ui: ReactElement = (
    <LeftPanel
      store={s.store}
      layers={s.layers}
      selection={s.selection}
      showObject={() => true}
      canEdit={o.canEdit ?? true}
      initialTab={o.tab}
    />
  );
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const one = (html: string, testId: string) => {
  const els = elements(html, testId);
  expect(els, testId).toHaveLength(1);
  return els[0]!;
};

describe('EZD-218 left panel', () => {
  it('AC-1 two text tabs, Layers and Rooms; Layers is open; no Versions tab', () => {
    const html = render(setup());
    expect(attr(one(html, 'left-panel').attrs, 'data-tab')).toBe('layers');
    const tabs = [...html.matchAll(/role="tab"/g)];
    expect(tabs).toHaveLength(2);
    expect(textOf(one(html, 'left-panel-tab-layers').inner)).toBe('Layers');
    expect(textOf(one(html, 'left-panel-tab-rooms').inner)).toBe('Rooms');
    expect(attr(one(html, 'left-panel-tab-layers').attrs, 'aria-selected')).toBe('true');
    expect(attr(one(html, 'left-panel-tab-rooms').attrs, 'aria-selected')).toBe('false');
    expect(html).not.toContain('Versions');
  });

  it('AC-2 Phase rows Existing, Demo, New with their dots, an eye and a lock; no Overlays heading', () => {
    const html = render(setup());
    expect(html).toContain('>Phase<');
    expect(html).not.toContain('Overlays');
    for (const [status, name] of [
      ['existing', 'Existing'],
      ['demo', 'Demo'],
      ['new', 'New'],
    ] as const) {
      const row = one(html, `layer-row-${status}`);
      expect(textOf(row.inner)).toBe(name);
      expect(row.inner).toContain(`data-dot="${status}"`);
    }
    // Existing view: Existing and Demo shown, New hidden (Q-0667).
    const eye = (id: string) => one(html, `layer-eye-${id}`);
    expect(attr(eye('existing').attrs, 'data-on')).toBe('true');
    expect(eye('existing').inner).toContain('#ez-icon-visibility"');
    expect(attr(eye('existing').attrs, 'aria-label')).toBe('Hide Existing');
    expect(attr(eye('new').attrs, 'data-on')).toBe('false');
    expect(eye('new').inner).toContain('#ez-icon-visibility_off"');
    expect(attr(eye('new').attrs, 'aria-label')).toBe('Show New');
    for (const id of ['existing', 'demo', 'new', 'rooms']) {
      const lock = one(html, `layer-lock-${id}`);
      expect(attr(lock.attrs, 'data-locked'), id).toBe('false');
      expect(lock.inner, id).toContain('#ez-icon-lock_open"');
    }
  });

  it('AC-3 a locked layer shows the closed lock', () => {
    const s = setup();
    s.layers.setLock('rooms', true);
    const lock = one(render(s), 'layer-lock-rooms');
    expect(attr(lock.attrs, 'data-locked')).toBe('true');
    expect(lock.inner).toContain('#ez-icon-lock"');
    expect(attr(lock.attrs, 'aria-label')).toBe('Unlock Rooms');
  });

  it('AC-2, AC-4 the Rooms section has its eye and lock and lists each room with name and area', () => {
    const html = render(setup());
    expect(textOf(one(html, 'layer-row-rooms').inner)).toBe('Rooms');
    const rows = elements(html, 'room-row');
    // 150" × 158.4" = 165 sf; 72" × 76" = 5,472 sq in = 38 sf (whole square feet, halves up).
    expect(rows.map((r) => textOf(r.inner).replace(/\s+/g, ' '))).toEqual([
      'Kitchen165 sf',
      'Laundry38 sf',
    ]);
  });

  it('AC-4 the Rooms tab lists the rooms and edits the one selected alone', () => {
    const html = render(setup({ selected: [uid(1)] }), { tab: 'rooms' });
    expect(attr(one(html, 'left-panel').attrs, 'data-tab')).toBe('rooms');
    expect(elements(html, 'room-row')).toHaveLength(2);
    const fields = one(html, 'room-fields');
    expect(attr(fields.attrs, 'data-room-id')).toBe(uid(1));
    expect(attr(one(html, 'room-name').attrs, 'value')).toBe('Kitchen');
    expect(textOf(one(html, 'room-area').inner)).toBe('165 sf');
    const type = one(html, 'room-type');
    expect(type.tag).toBe('select');
    expect(textOf(type.inner)).toBe('Not setKitchenBathLaundryOther');
    const ceiling = one(html, 'room-ceiling-type');
    expect(textOf(ceiling.inner)).toBe('Not setFlatSingle slopeVaulted/cathedralTrayCoffered');
    expect(one(html, 'room-floor-finish').tag).toBe('input');
  });

  it('AC-4 no fields while no room or more than one object is selected', () => {
    expect(elements(render(setup(), { tab: 'rooms' }), 'room-fields')).toHaveLength(0);
    const two = render(setup({ selected: [uid(1), uid(2)] }), { tab: 'rooms' });
    expect(elements(two, 'room-fields')).toHaveLength(0);
  });

  it('view-only: the room fields are plain text', () => {
    const html = render(setup({ selected: [uid(1)], bath: true }), {
      tab: 'rooms',
      canEdit: false,
    });
    const name = one(html, 'room-name');
    expect(name.tag).toBe('span');
    expect(textOf(name.inner)).toBe('Kitchen');
    expect(textOf(one(html, 'room-type').inner)).toBe('Bath');
    expect(textOf(one(html, 'room-floor-finish').inner)).toBe('Not set');
    expect(textOf(one(html, 'room-ceiling-type').inner)).toBe('Not set');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<input');
  });
});
