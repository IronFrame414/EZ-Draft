// EZD-514 Framing known and keep-clear (AC-EZD-514-1 "With Unknown there is no warning"; AC-EZD-514-2 "with entered
// lines a can on a joist warns"). Expected values: S05 Controls "Framing known | Inspector, when a ceiling is selected |
// Choose Unknown / New construction / Full demo / Enter locations. Enter locations: draw joist or beam lines with
// direction and spacing. Turns keep-clear checks on. | Edit model. Status bar text changes from "unknown · beam clash
// checks off"."; S05 Validation "Keep-clear warning when a can lands on a joist or beam"; vault/build/assumptions.md
// EZD-514 (a 4" can, a 1 1/2" joist, the wording). The fixture room is 144" x 120"; the joists run east-west from
// y = 24 at 16" on center (y = 8, 24, 40, ... 120), so a can at (60, 40) sits on one and a can at (60, 48) is clear.
// Markup through renderToStaticMarkup in the real office catalog, English. No browser.
import {
  CURRENT_SCHEMA_VERSION,
  type FramingKnown,
  type FramingLine,
  type Point,
} from '@ezdraft/geometry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { JoistsStatus } from '../ceiling/CeilingShown';
import { flaggedCeilingIds, framingItems, framingRepeats } from '../ceiling/rcp';
import { createSurfaceSetting } from '../ceiling/surface';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent } from '../plan/input';
import { addFramingLine, framingOf, removeFramingLine, setFramingKnown } from './framing-edits';
import {
  createFramingDrawing,
  framingDrawingFor,
  framingLineReceiver,
  squaredEnd,
} from './framing-tool';
import { CeilingFlags } from '../inspector/kinds/DevicePanel';
import { DOOR, F1, roomValue, uid } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const CAN_ID = uid(70);
const JOISTS: FramingLine = { kind: 'joist', start: P(0, 24), end: P(144, 24), spacing: 16 };

function model(known: FramingKnown | null, lines: FramingLine[] = [], can: Point | null = null) {
  const objects = new Map(DOOR);
  const room = roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Kitchen', null);
  if (known !== null)
    (room.data as { attributes: Record<string, unknown> }).attributes.framing = { known, lines };
  objects.set(ROOM_ID, room);
  if (can !== null)
    objects.set(CAN_ID, {
      type: 'device',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { point: can },
        status: 'new',
        level: F1,
        attributes: { kind: 'recessed_light' },
      },
    });
  return objects;
}

const click = (m: Point): PlanPointerEvent => ({
  kind: 'click',
  model: m,
  screen: m,
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

const wrap = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );

describe('EZD-514 framing edits', () => {
  it('a room without framing reads as Unknown with no lines', () => {
    expect(framingOf(model(null), ROOM_ID)).toEqual({ known: 'unknown', lines: [] });
  });

  it('the choice and each line are one change; the lines stay through a choice back to Unknown', () => {
    const objects = model(null);
    const set = setFramingKnown(objects, ROOM_ID, 'entered')!;
    expect(set.id).toBe(ROOM_ID);
    objects.set(ROOM_ID, set.value!);
    expect(setFramingKnown(objects, ROOM_ID, 'entered')).toBeNull();
    const add = addFramingLine(objects, ROOM_ID, JOISTS)!;
    objects.set(ROOM_ID, add.value!);
    expect(framingOf(objects, ROOM_ID)).toEqual({ known: 'entered', lines: [JOISTS] });
    objects.set(ROOM_ID, setFramingKnown(objects, ROOM_ID, 'unknown')!.value!);
    expect(framingOf(objects, ROOM_ID)).toEqual({ known: 'unknown', lines: [JOISTS] });
    objects.set(ROOM_ID, removeFramingLine(objects, ROOM_ID, 0)!.value!);
    expect(framingOf(objects, ROOM_ID)?.lines).toEqual([]);
    expect(removeFramingLine(objects, ROOM_ID, 0)).toBeNull();
    expect(setFramingKnown(objects, uid(99), 'entered')).toBeNull();
  });
});

describe('EZD-514 framing line tool', () => {
  function tool(objects: Map<string, ObjectValue>) {
    const store = createModelStore({ objects });
    const drawing = createFramingDrawing();
    const onMessage = vi.fn();
    const receive = framingLineReceiver({ store, drawing, onMessage });
    return { store, drawing, onMessage, receive };
  }

  it('two clicks inside the room add one line with the set member and spacing; the tool stays ready', () => {
    const t = tool(model('entered'));
    t.drawing.setTarget(ROOM_ID, 'joist', 16);
    t.receive(click(P(0.5, 24)));
    expect(t.drawing.get().start).toEqual(P(0.5, 24));
    // 3" off level over 143" is about 1.2 degrees: squared to level through the first click.
    t.receive(click(P(143.5, 27)));
    const framing = framingOf(t.store.getState().objects, ROOM_ID)!;
    expect(framing.lines).toEqual([
      { kind: 'joist', start: P(0.5, 24), end: P(143.5, 24), spacing: 16 },
    ]);
    expect(t.drawing.get().start).toBeNull();
  });

  it('a click outside the room says so and starts nothing', () => {
    const t = tool(model('entered'));
    t.drawing.setTarget(ROOM_ID, 'beam', null);
    t.receive(click(P(200, 40)));
    expect(t.onMessage).toHaveBeenCalledWith('office.ceiling.framing.click_room');
    expect(t.drawing.get().start).toBeNull();
  });

  it('squares a line near level or plumb and leaves a slanted one', () => {
    expect(squaredEnd(P(0, 0), P(100, 10))).toEqual(P(100, 0));
    expect(squaredEnd(P(0, 0), P(5, 100))).toEqual(P(0, 100));
    expect(squaredEnd(P(0, 0), P(100, 100))).toEqual(P(100, 100));
  });
});

describe('EZD-514 keep-clear in the inspector and on the RCP', () => {
  it('AC-EZD-514-1: with Unknown a can on a drawn joist has no warning', () => {
    const objects = model('unknown', [JOISTS], P(60, 40));
    const html = wrap(<CeilingFlags objects={objects} id={CAN_ID} canEdit fanClearance={null} />);
    expect(elements(html, 'device-keep-clear')).toHaveLength(0);
    expect(flaggedCeilingIds(objects, F1).has(CAN_ID.toLowerCase())).toBe(false);
  });

  it('AC-EZD-514-2: with entered lines a can on a joist warns, in the inspector and flagged on the RCP', () => {
    const objects = model('entered', [JOISTS], P(60, 40));
    const html = wrap(<CeilingFlags objects={objects} id={CAN_ID} canEdit fanClearance={null} />);
    const flag = elements(html, 'device-keep-clear')[0]!;
    expect(textOf(flag.inner)).toBe('Can is on a joist. Move it clear.');
    expect(attr(flag.attrs, 'role')).toBe('alert');
    expect(flaggedCeilingIds(objects, F1).has(CAN_ID.toLowerCase())).toBe(true);
    // Between joists: clear.
    const clear = model('entered', [JOISTS], P(60, 48));
    expect(
      elements(
        wrap(<CeilingFlags objects={clear} id={CAN_ID} canEdit fanClearance={null} />),
        'device-keep-clear',
      ),
    ).toHaveLength(0);
  });

  it('the lines draw dashed on the room, once per joist across it (y = 8 to 120, the north wall: 8 joists)', () => {
    expect(framingRepeats(JOISTS, [P(0, 0), P(144, 0), P(144, 120), P(0, 120)])).toEqual([
      -16, 0, 16, 32, 48, 64, 80, 96,
    ]);
    const items = framingItems(model('entered', [JOISTS]), F1, new Set([ROOM_ID.toLowerCase()]));
    // 144" at 6" on, 4" off: dashes start at 0, 10, ... 140 (15) per joist.
    expect(items).toHaveLength(8 * 15);
    expect(
      items.every((i) => i.objectId === ROOM_ID && i.kind === 'line' && i.role === 'hidden'),
    ).toBe(true);
  });
});

describe('EZD-514 Framing known section and Joists status', () => {
  function inspector(
    known: FramingKnown | null,
    canEdit = true,
    surfaceName: 'ceiling' | 'floor' = 'ceiling',
  ) {
    const store = createModelStore({ objects: model(known, known === null ? [] : [JOISTS]) });
    const ui = { ids: [ROOM_ID], selectMore: false };
    const selection = { getUi: () => ui, subscribe: () => () => {}, onDoubleClick: () => () => {} };
    const surface = createSurfaceSetting(surfaceName);
    return wrap(
      <InspectorPanel
        store={store}
        selection={selection}
        canEdit={canEdit}
        drawing={null}
        surface={surface}
        framingDrawing={framingDrawingFor(surface)}
      />,
    );
  }

  it('a room selected on the ceiling shows Framing known with the four choices', () => {
    const html = inspector(null);
    const section = elements(html, 'framing-known')[0]!;
    expect(section.inner).toContain('Framing known');
    const choice = elements(html, 'framing-known-choice')[0]!;
    expect(
      choice.inner
        .match(/<option[^>]*>([^<]*)</g)!
        .map((o) => o.replace(/<option[^>]*>/, '').slice(0, -1)),
    ).toEqual(['Unknown', 'New construction', 'Full demo', 'Enter locations']);
    // Unknown: no line controls.
    expect(elements(html, 'framing-draw')).toHaveLength(0);
  });

  it('with Enter locations it shows the member, spacing, Draw line and the drawn lines', () => {
    const html = inspector('entered');
    expect(elements(html, 'framing-member')).toHaveLength(1);
    expect(attr(elements(html, 'framing-spacing')[0]!.attrs, 'value')).toBe('1&#x27; 4&quot;');
    expect(textOf(elements(html, 'framing-draw')[0]!.inner)).toBe('Draw line');
    expect(textOf(elements(html, 'framing-line')[0]!.inner)).toBe('Joist · 1&#x27; 4&quot; o.c.');
  });

  it('view only: the choice is disabled and nothing can be drawn or removed', () => {
    const html = inspector('entered', false);
    expect(attr(elements(html, 'framing-known-choice')[0]!.attrs, 'disabled')).not.toBeNull();
    expect(elements(html, 'framing-draw')).toHaveLength(0);
    expect(elements(html, 'framing-line-remove')).toHaveLength(0);
    expect(elements(html, 'framing-line')).toHaveLength(1);
  });

  it('on the Floor surface a selected room has no Framing known section', () => {
    expect(elements(inspector('entered', true, 'floor'), 'framing-known')).toHaveLength(0);
  });

  it('the Joists status follows the active room: unknown, then known', () => {
    const status = (known: FramingKnown | null) => {
      const store = createModelStore({ objects: model(known) });
      const ui = { ids: [ROOM_ID], selectMore: false };
      const selection = { getUi: () => ui, subscribe: () => () => {} };
      return textOf(
        elements(wrap(<JoistsStatus store={store} selection={selection} />), 'status-joists')[0]!
          .inner,
      );
    };
    expect(status(null)).toBe('unknown · beam clash checks off');
    expect(status('unknown')).toBe('unknown · beam clash checks off');
    expect(status('new_construction')).toBe('new construction · beam clash checks on');
    expect(status('full_demo')).toBe('full demo · beam clash checks on');
    expect(status('entered')).toBe('entered · beam clash checks on');
  });
});
