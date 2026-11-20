// EZD-220 (AC-EZD-220-1, -2, -4, -6; S03:146 "without Edit model, view-only"; Q-0704 10-permissions "attaching a photo
// ... need Edit model"; Q-0704 05-screens "A failed photo upload keeps the pin and shows a retry state"; wording in
// vault/build/assumptions.md EZD-220). Markup through renderToStaticMarkup in the real office catalog, English (as
// inspector-rooms.test.tsx). Expected: one pin alone shows the pin inspector with its kind; with Edit model the kind
// is editable and Attach photo is offered for files of the photo types; without it both are read only; a failed
// upload shows Retry; a refused file shows the photo-types message; a pin with a photo loads its thumbnail.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import { InspectorPanel } from './InspectorPanel';
import { pinUploadOf } from './pin-uploads';

const P = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';

function withPin(id: string, photoFileId: string | null): Map<string, ObjectValue> {
  const o = baseObjects();
  o.set(id, {
    type: 'pin',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: { x: 48, y: 30 } },
      status: 'existing',
      level: F1,
      attributes: { kind: 'damage_moisture', photoFileId },
    },
  });
  return o;
}

function render(id: string, o: { canEdit: boolean; photo?: string | null; projectId?: string }) {
  const store = createModelStore({ objects: withPin(id, o.photo ?? null) });
  const ui = { ids: [id], selectMore: false };
  const selection = {
    getUi: () => ui,
    subscribe: () => () => {},
    onDoubleClick: () => () => {},
  };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel
        store={store}
        selection={selection}
        canEdit={o.canEdit}
        drawing={null}
        {...(o.projectId === undefined ? {} : { projectId: o.projectId })}
      />
    </MessagesProvider>,
  ).replace(/&#x27;/g, "'");
}

describe('EZD-220 pin inspector', () => {
  it('AC-1 a pin alone shows the pin inspector, Existing, with its kind', () => {
    const html = render(uid(901), { canEdit: true, projectId: P });
    expect(attr(elements(html, 'inspector')[0]!.attrs, 'data-inspector-kind')).toBe('pin');
    expect(textOf(elements(html, 'inspector-title')[0]!.inner)).toBe('Damage / moisture pin');
    expect(textOf(elements(html, 'inspector-subtitle')[0]!.inner)).toBe('Existing');
    const options = html.match(/<option value="[a-z_]+"/g);
    expect(options).toEqual([
      '<option value="damage_moisture"',
      '<option value="protect"',
      '<option value="lead"',
      '<option value="plumbing"',
      '<option value="gas"',
      '<option value="water_heater"',
    ]);
  });

  it('AC-2 with Edit model: the kind is editable and Attach photo takes the photo types', () => {
    const html = render(uid(902), { canEdit: true, projectId: P });
    expect(elements(html, 'pin-kind')[0]!.attrs).not.toContain('disabled');
    expect(textOf(elements(html, 'pin-photo-attach')[0]!.inner)).toBe('Attach photo');
    expect(attr(elements(html, 'pin-photo-input')[0]!.attrs, 'accept')).toBe(
      '.jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic',
    );
    expect(textOf(elements(html, 'pin-photo-none')[0]!.inner)).toBe('No photo yet.');
    expect(elements(html, 'inspector-view-only')).toHaveLength(0);
  });

  it('AC-6 without Edit model the pin and its photo are read only', () => {
    const html = render(uid(903), { canEdit: false, projectId: P, photo: FILE });
    expect(elements(html, 'pin-kind')[0]!.attrs).toContain('disabled');
    expect(elements(html, 'pin-photo-attach')).toHaveLength(0);
    expect(elements(html, 'pin-photo-input')).toHaveLength(0);
    expect(elements(html, 'inspector-view-only')).toHaveLength(1);
    // The photo is still shown: reading needs only seeing the project.
    expect(elements(html, 'pin-photo-loading')).toHaveLength(1);
  });

  it('AC-2 a pin with a photo loads its thumbnail and offers Replace photo', () => {
    const html = render(uid(904), { canEdit: true, projectId: P, photo: FILE });
    expect(textOf(elements(html, 'pin-photo-loading')[0]!.inner)).toBe('Loading photo…');
    expect(textOf(elements(html, 'pin-photo-attach')[0]!.inner)).toBe('Replace photo');
  });

  it('AC-4 a failed upload keeps the pin and shows Retry', () => {
    const id = uid(905);
    pinUploadOf(id).state = { kind: 'failed', code: 'upload_failed' };
    const html = render(id, { canEdit: true, projectId: P });
    expect(attr(elements(html, 'inspector')[0]!.attrs, 'data-inspector-kind')).toBe('pin');
    expect(textOf(elements(html, 'pin-photo-failed')[0]!.inner)).toContain(
      'Photo not uploaded. The pin is kept.',
    );
    expect(textOf(elements(html, 'pin-photo-retry')[0]!.inner)).toBe('Retry');
  });

  it('AC-2 another file type is refused with a message', () => {
    const id = uid(906);
    pinUploadOf(id).state = { kind: 'refused', reason: 'not_photo' };
    const html = render(id, { canEdit: true, projectId: P });
    expect(textOf(elements(html, 'pin-photo-refused')[0]!.inner)).toBe(
      'Choose a JPEG, PNG or HEIC photo.',
    );
  });

  it('without a project id a photo cannot be attached', () => {
    const html = render(uid(907), { canEdit: true });
    expect(elements(html, 'pin-photo-attach')).toHaveLength(0);
  });
});
