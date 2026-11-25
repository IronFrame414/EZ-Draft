// EZD-603 (S06 Controls "Device height note toggle (not in mockup) | Inspector, on a selected device | Shows a height
// note (e.g. "MW +66"") on the plan for that device. | Off by default. Edit model."; S06 Decisions 2; R24 #36;
// AC-EZD-603-1; vault/build/assumptions.md EZD-603). Inspector markup through renderToStaticMarkup in the real office
// catalog, English; the edits through the model store. No browser.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { catalogFor } from '../../server/messages/catalog';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore, type ModelStore } from '../model/model-store';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import { heightNoteEdit, heightNoteText, heightNoteView } from './height-note';

const ID = uid(603);

function withDevice(attributes: Record<string, unknown>) {
  const objects = baseObjects();
  objects.set(ID, {
    type: 'device',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: { x: 30, y: 40 } },
      status: 'new',
      level: F1,
      attributes,
    },
  } as ObjectValue);
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

const attrsOf = (store: ModelStore) =>
  (store.getState().objects.get(ID)!.data as { attributes: Record<string, unknown> }).attributes;

describe('EZD-603 height note in the inspector', () => {
  it('a selected receptacle shows its Height note, off by default, with no fixture type', () => {
    const html = render(withDevice({ kind: 'receptacle_duplex' }));
    expect(textOf(one(html, 'inspector-title').inner)).toBe('Duplex receptacle');
    expect(textOf(one(html, 'device-height-note').inner)).toContain('Height note');
    const toggle = one(html, 'device-height-note-toggle').attrs;
    expect(attr(toggle, 'checked')).toBeNull();
    expect(attr(toggle, 'disabled')).toBeNull();
    expect(attr(one(html, 'device-heightLabel').attrs, 'value')).toBe('');
    expect(attr(one(html, 'device-height').attrs, 'value')).toBe('');
    expect(elements(html, 'device-type')).toHaveLength(0);
  });

  it('a device with its note on shows it ticked, with its label and height', () => {
    const html = render(
      withDevice({ kind: 'receptacle_duplex', heightNote: true, heightLabel: 'MW', height: 66 }),
    );
    expect(attr(one(html, 'device-height-note-toggle').attrs, 'checked')).not.toBeNull();
    expect(attr(one(html, 'device-heightLabel').attrs, 'value')).toBe('MW');
    expect(attr(one(html, 'device-height').attrs, 'value')).toBe(`5' 6&quot;`);
  });

  it('a light keeps its Fixture type and gains the Height note', () => {
    const html = render(withDevice({ kind: 'recessed_light' }));
    expect(elements(html, 'device-type')).toHaveLength(1);
    expect(elements(html, 'device-height-note')).toHaveLength(1);
  });

  it('without Edit model the toggle and fields are read only', () => {
    const html = render(withDevice({ kind: 'switch_single' }), false);
    expect(attr(one(html, 'device-height-note-toggle').attrs, 'disabled')).not.toBeNull();
    expect(attr(one(html, 'device-heightLabel').attrs, 'disabled')).not.toBeNull();
    expect(attr(one(html, 'device-height').attrs, 'disabled')).not.toBeNull();
  });
});

describe('EZD-603 height note edits', () => {
  it('turning the note on, typing MW and 66 gives the note MW +66"; each is one undo step', () => {
    const store = createModelStore({ objects: withDevice({ kind: 'receptacle_duplex' }) });
    const step = (edit: Parameters<typeof heightNoteEdit>[2]) => {
      const r = heightNoteEdit(store.getState().objects, ID, edit);
      expect(r.ok).toBe(true);
      if (r.ok) store.applyEdit([r.change]);
    };
    step({ field: 'heightNote', value: true });
    step({ field: 'heightLabel', text: ' MW ' });
    step({ field: 'height', text: '66' });
    expect(attrsOf(store)).toMatchObject({ heightNote: true, heightLabel: 'MW', height: 66 });
    expect(heightNoteText(attrsOf(store))).toBe('MW +66"');
    store.undo();
    expect(attrsOf(store).height ?? null).toBeNull();
    expect(attrsOf(store).heightNote).toBe(true);
    store.undo();
    store.undo();
    expect(heightNoteView(store.getState().objects, ID)!.on).toBe(false);
  });

  it('a height in feet and inches is stored in inches', () => {
    const objects = withDevice({ kind: 'receptacle_duplex' });
    const r = heightNoteEdit(objects, ID, { field: 'height', text: `5'6"` });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect((r.change.value!.data as { attributes: { height: number } }).attributes.height).toBe(
        66,
      );
  });

  it('a cleared field stores null; a height of 0 or text that is not a length is refused', () => {
    const objects = withDevice({ kind: 'receptacle_duplex', heightLabel: 'MW', height: 66 });
    const cleared = heightNoteEdit(objects, ID, { field: 'heightLabel', text: '  ' });
    expect(cleared.ok).toBe(true);
    if (cleared.ok)
      expect(
        (cleared.change.value!.data as { attributes: { heightLabel: unknown } }).attributes
          .heightLabel,
      ).toBeNull();
    expect(heightNoteEdit(objects, ID, { field: 'height', text: '0' })).toEqual({
      ok: false,
      messageKey: 'office.length.refused',
    });
    expect(heightNoteEdit(objects, ID, { field: 'height', text: 'high' })).toEqual({
      ok: false,
      messageKey: 'office.length.refused',
    });
  });

  it('an id that names no device is refused', () => {
    expect(heightNoteEdit(baseObjects(), uid(999), { field: 'heightNote', value: true }).ok).toBe(
      false,
    );
  });
});
