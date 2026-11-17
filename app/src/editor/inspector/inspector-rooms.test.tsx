// EZD-218 (AC-EZD-218-5; P213a "Selection ids": the inspector's view and edits never see a room id; Q-0679 (b): with
// only a room selected the inspector title is the room's name and one line points to the Rooms tab, wording in
// vault/plans/EZD-218.md section 6). Real model store over the EZD-213a fixtures; rendered in the real office
// catalog, English.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import { createModelStore } from '../model/model-store';
import { commitInspectorEdits, lengthEdit } from './inspector-input';
import { roomNameOf, withoutRooms } from './inspector-view';
import { InspectorPanel } from './InspectorPanel';
import { houseObjects, idSeq, uid } from './test-utils/fixtures';

const KITCHEN = uid(20);
const W1 = uid(1);

function render(ids: string[]) {
  const store = createModelStore({ objects: houseObjects() });
  const ui = { ids, selectMore: false };
  const selection = {
    getUi: () => ui,
    subscribe: () => () => {},
    onDoubleClick: () => () => {},
  };
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <InspectorPanel store={store} selection={selection} canEdit drawing={null} />
    </MessagesProvider>,
  );
}

describe('EZD-218 inspector with rooms in the selection', () => {
  it('a wall and a room selected: a thickness edit changes the wall and is not refused', () => {
    const store = createModelStore({ objects: houseObjects() });
    const p = lengthEdit('wallThickness', '6"');
    if (!p.ok) throw new Error('6" did not parse');
    const ids = withoutRooms(store.getState().objects, [W1, KITCHEN]);
    expect(ids).toEqual([W1]);
    const r = commitInspectorEdits({ store, ids, newId: idSeq(900) }, [p.edit]);
    expect(r.ok).toBe(true);
    const wall = store.getState().objects.get(W1)!.data as { attributes: { thickness: number } };
    expect(wall.attributes.thickness).toBe(6);
  });

  it('a wall and a room selected: the inspector shows the wall', () => {
    const html = render([W1, KITCHEN]);
    expect(attr(elements(html, 'inspector')[0]!.attrs, 'data-inspector-kind')).toBe('wall');
  });

  it('Q-0679 (b) a room alone: its name as the title and the Rooms tab line', () => {
    const html = render([KITCHEN]);
    const panel = elements(html, 'inspector');
    expect(attr(panel[0]!.attrs, 'data-inspector-kind')).toBe('room');
    expect(textOf(elements(html, 'inspector-title')[0]!.inner)).toBe('Kitchen');
    expect(textOf(elements(html, 'inspector-subtitle')[0]!.inner)).toBe(
      'Edit this room&#x27;s details in the Rooms tab.',
    );
    expect(roomNameOf(houseObjects(), KITCHEN.toUpperCase())).toBe('Kitchen');
    expect(roomNameOf(houseObjects(), W1)).toBeNull();
  });
});
