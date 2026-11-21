// EZD-507 (S05 Controls "Fixture type tag edit | Inspector, on a light | Set type tag, lumens, color temperature, trim,
// catalog item. | Edit model."; S05 States "Locked / view-only: inspector fields read only"; S05 Controls "Smoke or CO
// detector", "Speaker or low voltage", "Access panel" kinds). Markup through renderToStaticMarkup in the real office
// catalog, English. No browser.
import type { Point } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { DeviceChooser } from '../../lazy/rcp/DeviceChooser';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore } from '../model/model-store';
import { placeCeilingDevice, type CeilingDeviceKind } from './fixture-tool';
import { baseObjects, F1, uid } from './test-utils/fixtures';

const ID = uid(800);
const at: Point = { x: 30, y: 40 };

function withDevice(kind: CeilingDeviceKind, attrs: Record<string, unknown> = {}) {
  const change = placeCeilingDevice(kind, at, { level: F1, newId: () => ID, status: 'new' })!;
  const value = change.value! as ObjectValue;
  const data = value.data as { attributes: Record<string, unknown> };
  data.attributes = { ...data.attributes, ...attrs };
  const objects = baseObjects();
  objects.set(ID, value);
  return objects;
}

function render(objects: Map<string, ObjectValue>, canEdit = true): string {
  const store = createModelStore({ objects });
  const ui = { ids: [ID], selectMore: false };
  const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel store={store} selection={selection} canEdit={canEdit} drawing={null} />
    </MessagesProvider>,
  ).replace(/&#x27;/g, "'");
}

const one = (html: string, testId: string) => {
  const found = elements(html, testId);
  expect(found, testId).toHaveLength(1);
  return found[0]!;
};

describe('EZD-507 fixture type in the inspector', () => {
  it('one light alone shows its Fixture type fields with their stored values', () => {
    const html = render(
      withDevice('recessed_light', {
        typeTag: 'A',
        lumens: 800,
        colorTemp: 3000,
        trim: 'White baffle',
      }),
    );
    expect(textOf(one(html, 'inspector-title').inner)).toBe('Recessed light');
    expect(textOf(one(html, 'device-status').inner)).toBe('New');
    expect(textOf(one(html, 'device-type').inner)).toContain('Fixture type');
    expect(attr(one(html, 'device-typeTag').attrs, 'value')).toBe('A');
    expect(attr(one(html, 'device-lumens').attrs, 'value')).toBe('800');
    expect(attr(one(html, 'device-colorTemp').attrs, 'value')).toBe('3000');
    expect(attr(one(html, 'device-trim').attrs, 'value')).toBe('White baffle');
    expect(textOf(one(html, 'device-catalog').inner)).toBe('None');
    expect(elements(html, 'device-catalog-pick')).toHaveLength(1);
  });

  it('a fan shows the fields too; a detector, a speaker and an access panel do not', () => {
    expect(elements(render(withDevice('ceiling_fan')), 'device-type')).toHaveLength(1);
    for (const kind of ['smoke_detector', 'speaker', 'access_panel'] as const)
      expect(elements(render(withDevice(kind)), 'device-type')).toHaveLength(0);
  });

  it('view only: every field is read only and there is no catalog picker button', () => {
    const html = render(withDevice('recessed_light'), false);
    for (const f of ['typeTag', 'lumens', 'colorTemp', 'trim'])
      expect(one(html, `device-${f}`).attrs).toMatch(/\sdisabled=""/);
    expect(elements(html, 'device-catalog-pick')).toHaveLength(0);
  });
});

function chooser(
  tool: Parameters<typeof DeviceChooser>[0]['tool'],
  kind: CeilingDeviceKind,
): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <DeviceChooser tool={tool} kind={kind} onChoose={() => {}} />
    </MessagesProvider>,
  );
}

describe('EZD-507 kind chooser of a ceiling device tool', () => {
  it('lists the kinds of each tool that has more than one, the chosen one pressed', () => {
    const cases = [
      ['detector', 'co_detector', ['smoke_detector', 'co_detector', 'smoke_co_detector']],
      ['low-voltage', 'speaker', ['speaker', 'camera', 'wifi_ap']],
      ['access-panel', 'access_panel', ['access_panel', 'attic_hatch']],
    ] as const;
    for (const [tool, kind, kinds] of cases) {
      const html = chooser(tool, kind);
      one(html, 'ceiling-device-chooser');
      for (const k of kinds)
        expect(attr(one(html, `ceiling-device-${k}`).attrs, 'aria-pressed')).toBe(
          String(k === kind),
        );
    }
    const html = chooser('low-voltage', 'speaker');
    expect(textOf(one(html, 'ceiling-device-wifi_ap').inner)).toBe('Wi-Fi access point');
  });

  it('a light or a fan tool has one kind, so no chooser', () => {
    expect(
      elements(chooser('recessed-light', 'recessed_light'), 'ceiling-device-chooser'),
    ).toHaveLength(0);
    expect(elements(chooser('ceiling-fan', 'ceiling_fan'), 'ceiling-device-chooser')).toHaveLength(
      0,
    );
  });
});
