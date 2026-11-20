// EZD-229 (AC-EZD-229-1, -3, -5; Q-0704 05-screens "Room photos come with EZD-229, in the Rooms tab, using EZD-220's
// attach piece"; Q-0704 10-permissions "attaching a photo ... need Edit model"; 09q Floor level, Transitions row 1;
// wording in vault/build/assumptions.md EZD-229). Markup through renderToStaticMarkup in the real office catalog,
// English (as PinPanel.test.tsx). Expected: the room's floor level shows at 1/16" and its transition to the room with
// a 3/4" step; Add photo is offered with Edit model and a project, for the photo types only; a photo loads its
// thumbnail; a failed upload shows Retry; a refused file shows the photo-types message.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { checkPinPhoto } from '../inspector/pin-photo';
import { pinUploadOf } from '../inspector/pin-uploads';
import { createModelStore } from '../model/model-store';
import { baseObjects, F1, roomValue, uid } from '../tools/test-utils/fixtures';
import { RoomFields } from './RoomFields';
import { roomAttributeChange, roomRows } from './rooms';
import { roomFloorLevelChange, roomPhotoChange } from './room-transitions';

const P = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';
const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function render(
  roomN: number,
  o: { canEdit: boolean; projectId?: string; photo?: boolean; step?: boolean },
) {
  const objects = baseObjects();
  objects.set(uid(roomN), roomValue(rect(0, 0, 120, 120), 'Kitchen', null));
  objects.set(uid(roomN + 1), roomValue(rect(120, 0, 120, 120), 'Family', null));
  const store = createModelStore({ objects });
  if (o.step)
    store.applyEdit([
      roomFloorLevelChange(store.getState().objects, uid(roomN + 1), '3/4"')!,
    ]);
  if (o.photo) store.applyEdit([roomPhotoChange(store.getState().objects, uid(roomN), PHOTO)!]);
  const row = roomRows(store.getState().objects, F1)[0]!;
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <RoomFields
        row={row}
        canEdit={o.canEdit}
        store={store}
        {...(o.projectId === undefined ? {} : { projectId: o.projectId })}
      />
    </MessagesProvider>,
  )
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

describe('EZD-229 Rooms tab floor level and transitions', () => {
  it('AC-1 a room next to a 3/4" step lists the transition; AC-3 its level shows at 1/16"', () => {
    const html = render(10, { canEdit: true, projectId: P, step: true });
    const level = elements(html, 'room-floor-level');
    expect(level).toHaveLength(1);
    expect(level[0]!.attrs).toContain('value="0""');
    const t = elements(html, 'room-transition');
    expect(t.map((e) => textOf(e.inner))).toEqual(['To Family · 3/4" step']);
  });

  it('AC-4 equal levels and finishes list none', () => {
    const html = render(20, { canEdit: true, projectId: P });
    expect(elements(html, 'room-transition')).toHaveLength(0);
    expect(textOf(elements(html, 'room-transition-none')[0]!.inner)).toBe('None');
  });
});

describe('EZD-229 Rooms tab photos (EZD-220 attach piece)', () => {
  it('AC-5 with Edit model and a project, Add photo is offered for the photo types', () => {
    const html = render(30, { canEdit: true, projectId: P });
    expect(textOf(elements(html, 'room-photos-none')[0]!.inner)).toBe('No photos yet.');
    expect(textOf(elements(html, 'room-photo-add')[0]!.inner)).toContain('Add photo');
    const input = elements(html, 'room-photo-input')[0]!;
    expect(attr(input.attrs, 'accept')).toBe('.jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic');
  });

  it('AC-5 without Edit model, or without a project, there is no Add photo', () => {
    expect(elements(render(40, { canEdit: false, projectId: P }), 'room-photo-add')).toHaveLength(0);
    expect(elements(render(42, { canEdit: true }), 'room-photo-add')).toHaveLength(0);
  });

  it('AC-5 a room with a photo loads its thumbnail', () => {
    const html = render(50, { canEdit: true, projectId: P, photo: true });
    expect(elements(html, 'room-photos-none')).toHaveLength(0);
    expect(elements(html, 'room-photo-loading')).toHaveLength(1);
  });

  it('AC-5 the same file checks: a PDF is refused with the photo-types message; a failed upload shows Retry', () => {
    expect(checkPinPhoto('plan.pdf', 100)).toEqual({ ok: false, reason: 'not_photo' });
    expect(checkPinPhoto('room.heic', 100).ok).toBe(true);
    pinUploadOf(uid(60)).state = { kind: 'refused', reason: 'not_photo' };
    const refused = render(60, { canEdit: true, projectId: P });
    expect(textOf(elements(refused, 'room-photo-refused')[0]!.inner)).toBe(
      'Choose a JPEG, PNG or HEIC photo.',
    );
    pinUploadOf(uid(70)).state = { kind: 'failed', code: 'upload_failed' };
    const failed = render(70, { canEdit: true, projectId: P });
    expect(textOf(elements(failed, 'room-photo-failed')[0]!.inner)).toContain('Photo not uploaded.');
    expect(elements(failed, 'room-photo-retry')).toHaveLength(1);
  });
});
