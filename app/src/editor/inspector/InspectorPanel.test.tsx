// EZD-213b U1-U8 (vault/plans/EZD-213b.md section 4; AC-EZD-213-1 to -6, -10, -12, -17 to -19, -21, -23). Markup through
// renderToStaticMarkup (the wrapper is MessagesProvider, L-020; helpers `textOf` and `decode` as in GapBoxes.test.tsx,
// plus a balanced-tag reader so a test does not depend on how the builder nests elements). Views come from
// `inspectorView` over the EZD-213a fixtures; expected text is the plan's rows and the S03d wording, never the code.
// No browser, no live service.
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NO_NUMBERS } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { inspectorEditChanges, type InspectorEdit } from './inspector-edits';
import { inspectorView, type InspectorView } from './inspector-view';
import { InspectorContent } from './InspectorPanel';
import { F1, houseObjects, idSeq, loneObjects, uid } from './test-utils/fixtures';

const DOT = '\u00b7';
const TIMES = '\u00d7';
const fn = () => {};

type Opts = { canEdit?: boolean; coarse?: boolean; layersEditing?: boolean };

function render(v: InspectorView, o: Opts = {}): string {
  const ui: ReactElement = (
    <InspectorContent
      view={v}
      canEdit={o.canEdit ?? true}
      coarse={o.coarse ?? false}
      layersEditing={o.layersEditing ?? false}
      onToggleLayers={fn}
      onCommit={() => null}
      onLayerMaterial={() => null}
    />
  );
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
const count = (s: string, needle: string) => s.split(needle).length - 1;
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, ''));

const startTag = (html: string, testId: string): string | null => {
  const m = html.match(new RegExp(`<\\w+[^>]*data-testid="${testId}"[^>]*>`));
  return m ? m[0] : null;
};
const has = (html: string, testId: string): boolean => startTag(html, testId) !== null;
const attr = (html: string, testId: string, name: string): string | null => {
  const tag = startTag(html, testId);
  if (tag === null) return null;
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]!) : null;
};
// The inner markup of the element with this test id, tags balanced; '' for a void element.
const inner = (html: string, testId: string): string | null => {
  const tag = startTag(html, testId);
  if (tag === null) return null;
  const name = tag.match(/^<(\w+)/)![1]!;
  if (['input', 'img', 'br', 'hr'].includes(name)) return '';
  const from = html.indexOf(tag) + tag.length;
  const re = new RegExp(`<${name}\\b|</${name}>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
};
const textOf = (html: string, testId: string): string | null => {
  const i = inner(html, testId);
  return i === null ? null : strip(i);
};
const flat = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const before = (html: string, a: string, b: string) =>
  expect(html.indexOf(`data-testid="${a}"`), `${a} before ${b}`).toBeLessThan(
    html.indexOf(`data-testid="${b}"`),
  );
const options = (html: string, testId: string) =>
  [...(inner(html, testId) ?? '').matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map((m) => ({
    value: (m[1]!.match(/value="([^"]*)"/) ?? [])[1] ?? null,
    selected: /\sselected(=|\s|$)/.test(m[1]!),
    text: decode(m[2]!),
  }));
const isMixed = (html: string, testId: string) =>
  attr(html, testId, 'placeholder') === 'Mixed' || textOf(html, testId) === 'Mixed';

const viewOf = (objects: Objects, ids: string[]): InspectorView => inspectorView(objects, F1, ids);
function after(ids: string[], edit: InspectorEdit, objects: Objects = houseObjects()): Objects {
  const r = inspectorEditChanges({
    objects,
    level: F1,
    ids,
    edit,
    newId: idSeq(900),
    highs: NO_NUMBERS,
  });
  if (!r.ok) throw new Error(`setup edit refused: ${r.reason}`);
  const store = createModelStore({ objects });
  store.applyEdit(r.changes);
  return store.getState().objects;
}

describe('EZD-213b inspector panel', () => {
  it('EZD-213b U1 empty inspector', () => {
    const desk = render({ kind: 'empty' }, { coarse: false });
    expect(attr(desk, 'inspector', 'data-inspector-kind')).toBe('empty');
    expect(textOf(desk, 'inspector-empty')).toContain(
      'Select something on the plan to see its details here.',
    );
    expect(textOf(desk, 'inspector-empty-hint')).toBe(
      'Shift-click or drag a box to select more than one.',
    );
    expect(desk).toContain('#ez-icon-arrow_selector_tool');

    const touch = render({ kind: 'empty' }, { coarse: true });
    expect(textOf(touch, 'inspector-empty-hint')).toBe(
      'Tap Select more, or drag a box, to select more than one.',
    );
    expect(strip(touch)).not.toContain('Shift-click or drag a box');
  });

  it('EZD-213b U2 wall panel', () => {
    const html = render(viewOf(houseObjects(), [uid(5)]));
    expect(attr(html, 'inspector', 'data-inspector-kind')).toBe('wall');
    expect(textOf(html, 'inspector-title')).toBe('Wall 5');
    expect(textOf(html, 'inspector-subtitle')).toBe(`Kitchen ${DOT} Laundry`);
    expect(attr(html, 'inspector-length', 'value')).toBe(`10' 0"`);
    expect(attr(html, 'inspector-thickness', 'value')).toBe('4 1/2"');
    expect(attr(html, 'inspector-height', 'value')).toBe(`8' 0"`);
    before(html, 'inspector-length', 'inspector-thickness');
    before(html, 'inspector-thickness', 'inspector-height');
    expect(flat(textOf(html, 'inspector-layer-0'))).toBe('Drywall 1/2"');
    expect(flat(textOf(html, 'inspector-layer-1'))).toBe('Stud 3 1/2"');
    expect(flat(textOf(html, 'inspector-layer-2'))).toBe('Drywall 1/2"');
    expect(textOf(html, 'inspector-layers-total')).toContain('4 1/2"');
    expect(textOf(html, 'inspector-layers-total')).toContain('Total');
    expect(attr(html, 'inspector-edit-layers', 'aria-pressed')).toBe('false');
    expect(textOf(html, 'inspector-status')).toContain('Existing');
    expect(inner(html, 'inspector-status')).toContain('#ez-icon-lock');
    expect(attr(html, 'inspector-status', 'aria-label')).toBe('Status, read only');
    expect(startTag(html, 'inspector-bearing')).toMatch(/^<input/);
    expect(attr(html, 'inspector-bearing', 'type')).toBe('checkbox');
    expect(startTag(html, 'inspector-bearing')).not.toMatch(/\schecked/);
    expect(has(html, 'inspector-swing-hand')).toBe(false);
    expect(has(html, 'inspector-view-only')).toBe(false);
  });

  it('EZD-213b U3 door labels', () => {
    const a = render(viewOf(houseObjects(), [uid(30)]));
    expect(attr(a, 'inspector', 'data-inspector-kind')).toBe('opening');
    expect(attr(a, 'inspector', 'data-opening-kind')).toBe('door');
    expect(textOf(a, 'inspector-title')).toBe('Door 1');
    expect(textOf(a, 'inspector-subtitle')).toBe(`Kitchen ${DOT} Wall 1`);
    expect(attr(a, 'inspector-width', 'value')).toBe(`3' 0"`);
    expect(attr(a, 'inspector-opening-height', 'value')).toBe(`6' 8"`);
    const textA = strip(a);
    for (const t of ['Hinge left', 'Hinge right', 'Into Kitchen', 'Outside']) {
      expect(textA, t).toContain(t);
    }
    expect(attr(a, 'inspector-tile-left-left', 'aria-checked')).toBe('true');
    expect(attr(a, 'inspector-tile-left-left', 'aria-label')).toBe(
      'Opens into Kitchen, hinge on the left',
    );
    for (const id of ['left-right', 'right-left', 'right-right']) {
      expect(attr(a, `inspector-tile-${id}`, 'aria-checked'), id).toBe('false');
    }
    expect(attr(a, 'inspector-tile-right-right', 'aria-label')).toBe(
      'Opens outside, hinge on the right',
    );
    expect(textOf(a, 'inspector-door-result')).toBe(`Opens into Kitchen ${DOT} hinge on the left`);
    expect(textOf(a, 'inspector-door-hint')).toBe(
      'Left and right as drawn on the plan. On the plan, click the arc to flip the swing, or the hinge dot to flip the hand.',
    );
    expect(attr(a, 'inspector-offset', 'value')).toBe(`1' 0"`);
    expect(textOf(a, 'inspector-offset-caption')).toBe('to the inside corner at Wall 4');
    expect(attr(a, 'inspector-rough-opening', 'value')).toBe(`3' 2" ${TIMES} 6' 10 1/2"`);
    expect(textOf(a, 'inspector-rough-opening-auto')).toBe('Auto');
    expect(attr(a, 'inspector-impact-not_rated', 'aria-checked')).toBe('true');
    for (const id of ['inspector-sill', 'inspector-status', 'inspector-shutter-type']) {
      expect(has(a, id), id).toBe(false);
    }

    const b = render(viewOf(houseObjects(), [uid(31)]));
    expect(textOf(b, 'inspector-subtitle')).toBe(`Kitchen ${DOT} Laundry ${DOT} Wall 5`);
    const textB = strip(b);
    for (const t of ['Hinge top', 'Hinge bottom', 'Into Kitchen', 'Into Laundry']) {
      expect(textB, t).toContain(t);
    }
    expect(textB).not.toContain('Hinge left');
    expect(textB).not.toContain('Hinge right');
    expect(textOf(b, 'inspector-door-result')).toBe(`Opens into Kitchen ${DOT} hinge at the top`);
    expect(textOf(b, 'inspector-offset-caption')).toBe('to the inside corner at Wall 3');

    const c = render(
      viewOf(after([uid(30)], { field: 'impactRating', value: 'shutter' }), [uid(30)]),
    );
    expect(attr(c, 'inspector-impact-shutter', 'aria-checked')).toBe('true');
    const opts = options(c, 'inspector-shutter-type');
    expect(opts.map((o) => o.text)).toEqual([
      'Choose a type',
      'Accordion',
      'Roll-down',
      'Storm panel',
      'Colonial',
      'Bahama',
    ]);
    expect(opts[0]).toMatchObject({ value: '', selected: true });
  });

  it('EZD-213b U4 window panel', () => {
    const a = render(viewOf(houseObjects(), [uid(32)]));
    expect(attr(a, 'inspector', 'data-opening-kind')).toBe('window');
    expect(textOf(a, 'inspector-title')).toBe('Window 1');
    expect(attr(a, 'inspector-sill', 'value')).toBe(`3' 0"`);
    expect(attr(a, 'inspector-rough-opening', 'value')).toBe(`3' 0 1/2" ${TIMES} 4' 0 1/2"`);
    expect(textOf(a, 'inspector-rough-opening-auto')).toBe('Auto');
    expect(has(a, 'inspector-swing-hand')).toBe(false);
    expect(has(a, 'inspector-door-hint')).toBe(false);

    const objects = after([uid(32)], { field: 'roughOpening', width: 40, height: 50 });
    const b = render(viewOf(objects, [uid(32)]));
    expect(attr(b, 'inspector-rough-opening', 'value')).toBe(`3' 4" ${TIMES} 4' 2"`);
    expect(has(b, 'inspector-rough-opening-auto')).toBe(false);
  });

  it('EZD-213b U5 free end and Not on a wall', () => {
    const lone = render(viewOf(loneObjects({ x: 0, y: 120 }), [uid(41)]));
    expect(textOf(lone, 'inspector-subtitle')).toBe('Wall 9');
    expect(textOf(lone, 'inspector-offset-caption')).toBe('to the end of the wall');
    const textLone = strip(lone);
    expect(textLone).toContain('Left on the plan');
    expect(textLone).toContain('Right on the plan');
    expect(textOf(lone, 'inspector-door-result')).toBe(
      `Opens left on the plan ${DOT} hinge at the top`,
    );

    const objects: Map<string, ObjectValue> = houseObjects();
    const door = objects.get(uid(30))!;
    const g = (door.data as { geometry: Record<string, unknown> }).geometry;
    objects.set(uid(30), {
      ...door,
      data: {
        ...door.data,
        geometry: { ...g, center: { x: 30, y: 0 }, hostWallId: null, axis: { x: 1, y: 0 } },
      },
    });
    const flagged = render(viewOf(objects, [uid(30)]));
    expect(textOf(flagged, 'inspector-not-on-wall')).toContain('Not on a wall');
    expect(textOf(flagged, 'inspector-not-on-wall')).toContain(
      'Drag it onto a wall, or delete it.',
    );
    expect(inner(flagged, 'inspector-not-on-wall')).toContain('#ez-icon-error');
    expect(textOf(flagged, 'inspector-subtitle')).toBe('Not on a wall');
    expect(has(flagged, 'inspector-offset')).toBe(false);
    const textFlagged = strip(flagged);
    expect(textFlagged).toContain('Up on the plan');
    expect(textFlagged).toContain('Down on the plan');
    expect(startTag(flagged, 'inspector-width')).toMatch(/^<input/);
  });

  it('EZD-213b U6 bulk shows only shared fields', () => {
    const a = render(
      viewOf(after([uid(5)], { field: 'wallThickness', inches: 6.5 }), [uid(1), uid(5)]),
    );
    expect(attr(a, 'inspector', 'data-inspector-kind')).toBe('bulk');
    expect(textOf(a, 'inspector-title')).toBe('2 walls selected');
    expect(textOf(a, 'inspector-subtitle')).toBe('Changes apply to all 2.');
    expect(attr(a, 'inspector-thickness', 'value') ?? '').toBe('');
    expect(attr(a, 'inspector-thickness', 'placeholder')).toBe('Mixed');
    expect(attr(a, 'inspector-height', 'value')).toBe(`8' 0"`);
    expect(textOf(a, 'inspector-layers-mixed')).toBe('Mixed');
    for (const id of ['inspector-length', 'inspector-status', 'inspector-edit-layers']) {
      expect(has(a, id), id).toBe(false);
    }

    const b = render(viewOf(houseObjects(), [uid(1), uid(2)]));
    for (const i of [0, 1, 2]) {
      expect(has(b, `inspector-layer-${i}`), `row ${i}`).toBe(true);
      expect(inner(b, `inspector-layer-${i}`)).not.toMatch(/<(input|select)/);
    }
    expect(has(b, 'inspector-edit-layers')).toBe(false);

    const c = render(
      viewOf(after([uid(1)], { field: 'wallBearing', value: true }), [uid(1), uid(2)]),
    );
    expect(startTag(c, 'inspector-bearing')).toMatch(/^<input/);
    expect(attr(c, 'inspector-bearing', 'type')).toBe('checkbox');
    expect(startTag(c, 'inspector-bearing')).not.toMatch(/\schecked/);
    expect(attr(c, 'inspector-bearing', 'aria-label')).toBe('Bearing, mixed');
    expect(textOf(c, 'inspector-bearing-mixed')).toBe('Mixed');

    const d = render(viewOf(houseObjects(), [uid(30), uid(31)]));
    expect(textOf(d, 'inspector-title')).toBe('2 doors selected');
    expect(attr(d, 'inspector-width', 'value')).toBe(`3' 0"`);
    for (const id of ['inspector-swing-hand', 'inspector-offset', 'inspector-sill']) {
      expect(has(d, id), id).toBe(false);
    }

    const e = render(viewOf(houseObjects(), [uid(30), uid(32)]));
    expect(textOf(e, 'inspector-title')).toBe('2 objects selected');
    expect(attr(e, 'inspector-opening-height', 'placeholder')).toBe('Mixed');
    expect(isMixed(e, 'inspector-rough-opening')).toBe(true);
    expect(attr(e, 'inspector-impact-not_rated', 'aria-checked')).toBe('true');

    const f = render(viewOf(houseObjects(), [uid(1), uid(30)]));
    expect(textOf(f, 'inspector-title')).toBe('2 objects selected');
    for (const tag of ['<input', '<select', '<button']) expect(f, tag).not.toContain(tag);
  });

  it('EZD-213b U7 view-only reads plain text', () => {
    const wall = render(viewOf(houseObjects(), [uid(5)]), { canEdit: false });
    expect(textOf(wall, 'inspector-view-only')).toBe('View only');
    expect(inner(wall, 'inspector-view-only')).toContain('#ez-icon-visibility');
    expect(startTag(wall, 'inspector-length')).toMatch(/^<span/);
    expect(textOf(wall, 'inspector-length')).toBe(`10' 0"`);
    expect(textOf(wall, 'inspector-layers')).toBe(
      `Drywall 1/2" ${DOT} Stud 3 1/2" ${DOT} Drywall 1/2"`,
    );
    expect(textOf(wall, 'inspector-status')).toContain('Existing');
    expect(textOf(wall, 'inspector-bearing')).toBe('No');
    for (const tag of ['<input', '<select', '<button']) expect(wall, tag).not.toContain(tag);

    const door = render(viewOf(houseObjects(), [uid(30)]), { canEdit: false });
    expect(textOf(door, 'inspector-door-result')).toBe(
      `Opens into Kitchen ${DOT} hinge on the left`,
    );
    expect(door).not.toContain('data-testid="inspector-tile-');
    expect(has(door, 'inspector-door-hint')).toBe(false);
    for (const tag of ['<input', '<select', '<button']) expect(door, tag).not.toContain(tag);
  });

  it('EZD-213b U8 Edit layers rows in place', () => {
    const html = render(viewOf(houseObjects(), [uid(5)]), { layersEditing: true });
    expect(attr(html, 'inspector-edit-layers', 'aria-pressed')).toBe('true');
    const thick = ['1/2"', '3 1/2"', '1/2"'];
    for (const i of [0, 1, 2]) {
      expect(startTag(html, `inspector-layer-${i}-material`), `select ${i}`).toMatch(/^<select/);
      expect(attr(html, `inspector-layer-${i}-thickness`, 'value')).toBe(thick[i]);
      expect(startTag(html, `inspector-layer-${i}-thickness`)).toMatch(/^<input/);
    }
    const selectedNow = ['drywall', 'stud', 'drywall'];
    for (const i of [0, 1, 2]) {
      const opts = options(html, `inspector-layer-${i}-material`);
      expect(
        opts.map((o) => [o.value, o.text]),
        `options ${i}`,
      ).toEqual([
        ['stud', 'Stud'],
        ['drywall', 'Drywall'],
        ['tile_backer', 'Tile backer'],
      ]);
      expect(opts.find((o) => o.selected)?.value, `selected ${i}`).toBe(selectedNow[i]);
    }
    expect(textOf(html, 'inspector-layers-total')).toContain('4 1/2"');
    expect(count(html, '<button')).toBe(1);
  });
});
