// EZD-213b I1-I4, K1 (vault/plans/EZD-213b.md section 4; AC-EZD-213-1, -7, -17 to -19, -21, -23). Expected values: the
// plan's rows and their cited sources (04 Measurement entry; Q-0640 rows 5-4, 5-5; Q-0630 row 20; 09k Thickness;
// Decided "D-Parse", "D-Refusal text", "D-commitInspectorEdits"; sections 3 and 6 for the messages), never the code.
// ASCII only: the middle dot and the multiplication sign are written as escapes (L-042). No browser, no live service.
import { describe, expect, it } from 'vitest';
import type { WallData, OpeningData } from '@ezdraft/geometry';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { createModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import {
  commitInspectorEdits,
  layerEdit,
  layerMaterialEdit,
  lengthEdit,
  refusalMessage,
  roughOpeningEdit,
} from './inspector-input';
import type { InspectorEdit, InspectorEditReason } from './inspector-edits';
import { F1, houseObjects, idSeq, uid } from './test-utils/fixtures';

const REFUSED = 'office.length.refused';
const ones = '1'.repeat(33);
const manyOnes = '1'.repeat(66);

const wallOf = (objects: Objects, id: string): WallData =>
  objects.get(id)!.data as unknown as WallData;
const openingOf = (objects: Objects, id: string): OpeningData =>
  objects.get(id)!.data as unknown as OpeningData;

const commit = (
  store: ReturnType<typeof createModelStore>,
  ids: string[],
  edits: InspectorEdit[],
) => commitInspectorEdits({ store, ids, newId: idSeq(900) }, edits);

describe('EZD-213b inspector input', () => {
  it('EZD-213b I1 typed text becomes an edit', () => {
    expect(lengthEdit('wallLength', `12' 6"`)).toEqual({
      ok: true,
      edit: { field: 'wallLength', inches: 150 },
    });
    expect(lengthEdit('wallLength', '150"')).toEqual({
      ok: true,
      edit: { field: 'wallLength', inches: 150 },
    });
    expect(lengthEdit('wallLength', '0')).toEqual({
      ok: true,
      edit: { field: 'wallLength', inches: 0 },
    });
    for (const text of ['', '12 ft', ones]) {
      expect(lengthEdit('wallLength', text), text).toEqual({ ok: false, messageKey: REFUSED });
    }

    for (const text of ['34 1/2 x 82 1/2', '34 1/2" \u00d7 82 1/2"']) {
      expect(roughOpeningEdit(text), text).toEqual({
        ok: true,
        edit: { field: 'roughOpening', width: 34.5, height: 82.5 },
      });
    }
    for (const text of ['34 1/2', '34 by 82', '', manyOnes]) {
      expect(roughOpeningEdit(text), text).toEqual({ ok: false, messageKey: REFUSED });
    }

    expect(layerEdit(0, 'drywall', '5/8"')).toEqual({
      ok: true,
      edit: { field: 'wallLayer', index: 0, layer: { material: 'drywall', thickness: 0.625 } },
    });
    for (const text of ['', 'half', ones]) {
      expect(layerEdit(0, 'stud', text), text).toEqual({ ok: false, messageKey: REFUSED });
    }
  });

  it('EZD-213b I2 refusal text', () => {
    const expected: Record<InspectorEditReason, string> = {
      zero_length: 'office.tools.gap.zero_length',
      too_long: 'office.tools.gap.too_long',
      join_lost: 'office.tools.gap.join_lost',
      stud_not_positive: 'office.inspector.error.stud_zero',
      no_stud: 'office.inspector.error.no_stud',
      only_stud: 'office.inspector.error.only_stud',
      not_positive: 'office.inspector.error.zero',
      past_corner: 'office.inspector.error.past_corner',
      overlap: 'office.inspector.error.overlap',
      not_on_wall: 'office.inspector.error.not_on_wall',
      invalid_input: 'office.length.refused',
      not_found: 'error.invalid_input',
      not_applicable: 'error.invalid_input',
      not_shared: 'error.invalid_input',
      negative: 'error.invalid_input',
      not_door: 'error.invalid_input',
      not_window: 'error.invalid_input',
      not_shutter: 'error.invalid_input',
    };
    const reasons = Object.keys(expected) as InspectorEditReason[];
    expect(reasons).toHaveLength(18);
    for (const reason of reasons) {
      expect(refusalMessage('wallHeight', reason), reason).toBe(expected[reason]);
    }
    expect(refusalMessage('wallLayer', 'not_positive')).toBe('office.inspector.error.layer_zero');
  });

  it('EZD-213b I3 one commit is one undo step', () => {
    const a = createModelStore({ objects: houseObjects() });
    expect(commit(a, [uid(1), uid(5)], [{ field: 'wallThickness', inches: 6.5 }]).ok).toBe(true);
    expect(a.getState().past).toHaveLength(1);
    for (const id of [uid(1), uid(5)]) {
      const w = wallOf(a.getState().objects, id);
      expect(w.attributes.thickness, id).toBeCloseTo(6.5, 9);
      const stud = w.attributes.layers.find((l) => l.material === 'stud');
      expect(stud!.thickness, id).toBeCloseTo(5.5, 9);
    }

    const b = createModelStore({ objects: houseObjects() });
    expect(commit(b, [uid(5)], [{ field: 'wallThickness', inches: 1 }])).toEqual({
      ok: false,
      messageKey: 'office.inspector.error.stud_zero',
    });
    expect(b.getState().past).toHaveLength(0);

    const c = createModelStore({ objects: houseObjects() });
    const cr = commit(
      c,
      [uid(30)],
      [
        { field: 'swing', value: 'right' },
        { field: 'hand', value: 'right' },
      ],
    );
    expect(cr.ok).toBe(true);
    expect(c.getState().past).toHaveLength(1);
    expect(openingOf(c.getState().objects, uid(30)).attributes.swing).toBe('right');
    expect(openingOf(c.getState().objects, uid(30)).attributes.hand).toBe('right');

    const d = createModelStore({ objects: houseObjects() });
    expect(
      commit(
        d,
        [uid(30)],
        [
          { field: 'swing', value: 'right' },
          { field: 'offsetLeft', inches: 36 },
        ],
      ),
    ).toEqual({ ok: false, messageKey: 'office.inspector.error.past_corner' });
    expect(d.getState().past).toHaveLength(0);
    expect(openingOf(d.getState().objects, uid(30)).attributes.swing).toBe('left');

    const e = createModelStore({ objects: houseObjects() });
    expect(commit(e, [uid(5)], [{ field: 'wallThickness', inches: 4.5 }])).toEqual({
      ok: true,
      changed: 0,
    });
    expect(e.getState().past).toHaveLength(0);
  });

  it('EZD-213b I4 layer material', () => {
    const objects = houseObjects();
    const toStud = layerMaterialEdit(objects, F1, uid(5), 1, 'drywall');
    expect(toStud).toEqual({
      field: 'wallLayer',
      index: 1,
      layer: { material: 'drywall', thickness: 3.5 },
    });
    const a = createModelStore({ objects: houseObjects() });
    expect(commit(a, [uid(5)], [toStud!])).toEqual({
      ok: false,
      messageKey: 'office.inspector.error.only_stud',
    });

    const tile = layerMaterialEdit(objects, F1, uid(5), 0, 'tile_backer');
    const b = createModelStore({ objects: houseObjects() });
    expect(commit(b, [uid(5)], [tile!]).ok).toBe(true);
    const w = wallOf(b.getState().objects, uid(5));
    expect(w.attributes.layers[0]!.material).toBe('tile_backer');
    expect(w.attributes.layers[0]!.thickness).toBeCloseTo(0.5, 9);
    expect(w.attributes.thickness).toBeCloseTo(4.5, 9);

    expect(layerMaterialEdit(objects, F1, uid(5), 3, 'stud')).toBeNull();
    expect(layerMaterialEdit(objects, F1, uid(99), 0, 'stud')).toBeNull();
  });

  it('EZD-213b K1 inspector messages', () => {
    const P = 'office.inspector.';
    const expected: Record<string, string> = {
      empty: 'Select something on the plan to see its details here.',
      empty_hint: 'Shift-click or drag a box to select more than one.',
      empty_hint_touch: 'Tap Select more, or drag a box, to select more than one.',
      view_only: 'View only',
      'bulk_title.walls': '{count} walls selected',
      'bulk_title.objects': '{count} objects selected',
      'bulk_title.doors': '{count} doors selected',
      'bulk_title.windows': '{count} windows selected',
      bulk_subtitle: 'Changes apply to all {count}.',
      not_on_wall: 'Not on a wall',
      not_on_wall_hint: 'Drag it onto a wall, or delete it.',
      mixed: 'Mixed',
      'field.length': 'Length',
      'field.thickness': 'Thickness',
      'field.height': 'Height',
      'field.layers': 'Layers',
      'field.status': 'Status',
      'field.bearing': 'Bearing',
      'field.size': 'Size',
      'field.width': 'Width',
      'field.swing_hand': 'Swing and Hand',
      'field.offset': 'Offset from corner',
      'field.rough_opening': 'Rough opening',
      'field.impact': 'Impact rating',
      'field.sill': 'Sill height',
      'field.shutter_type': 'Shutter type',
      'field.total': 'Total',
      'field.edit_layers': 'Edit layers',
      status_read_only: 'Status, read only',
      bearing_mixed: 'Bearing, mixed',
      yes: 'Yes',
      no: 'No',
      'status.existing': 'Existing',
      'status.demo': 'Demo',
      'status.new': 'New',
      'material.drywall': 'Drywall',
      'material.stud': 'Stud',
      'material.tile_backer': 'Tile backer',
      auto: 'Auto',
      'impact.not_rated': 'Not rated',
      'impact.impact_rated': 'Impact rated',
      'impact.shutter': 'Shutter',
      'shutter.accordion': 'Accordion',
      'shutter.roll_down': 'Roll-down',
      'shutter.storm_panel': 'Storm panel',
      'shutter.colonial': 'Colonial',
      'shutter.bahama': 'Bahama',
      shutter_none: 'Choose a type',
      'hinge.left': 'Hinge left',
      'hinge.right': 'Hinge right',
      'hinge.top': 'Hinge top',
      'hinge.bottom': 'Hinge bottom',
      'side.room': 'Into {name}',
      'side.outside': 'Outside',
      'side.up': 'Up on the plan',
      'side.down': 'Down on the plan',
      'side.left': 'Left on the plan',
      'side.right': 'Right on the plan',
      'opens.room': 'Opens into {name}',
      'opens.outside': 'Opens outside',
      'opens.up': 'Opens up on the plan',
      'opens.down': 'Opens down on the plan',
      'opens.left': 'Opens left on the plan',
      'opens.right': 'Opens right on the plan',
      'hinge_on.left': 'hinge on the left',
      'hinge_on.right': 'hinge on the right',
      'hinge_on.top': 'hinge at the top',
      'hinge_on.bottom': 'hinge at the bottom',
      door_result: '{opens} \u00b7 {hinge}',
      door_tile: '{opens}, {hinge}',
      door_hint:
        'Left and right as drawn on the plan. On the plan, click the arc to flip the swing, or the hinge dot to flip the hand.',
      'offset.corner': 'to the inside corner at Wall {number}',
      'offset.corner_unnumbered': 'to the inside corner',
      'offset.free_end': 'to the end of the wall',
      rough_opening_value: '{width} \u00d7 {height}',
      layer_value: '{material} {thickness}',
      no_room: 'Not in a room',
      'error.stud_zero': 'That would leave the stud 0" thick',
      'error.no_stud': 'This wall has no stud layer to change',
      'error.layer_zero': 'A layer must be thicker than 0"',
      'error.only_stud': 'The wall needs its stud layer',
      'error.zero': 'Must be more than 0"',
      'error.past_corner': 'That goes past the end of the wall',
      'error.overlap': 'That overlaps another door or window',
      'error.not_on_wall': 'Drag it onto a wall first',
    };
    const keysOf = (catalog: object) =>
      Object.keys(catalog)
        .filter((k) => k.startsWith(P))
        .sort();
    const E = en as unknown as Record<string, unknown>;
    expect(keysOf(en)).toEqual(
      Object.keys(expected)
        .map((k) => P + k)
        .sort(),
    );
    for (const [key, value] of Object.entries(expected)) expect(E[P + key], key).toBe(value);
    expect(keysOf(es)).toEqual([]);
  });
});
