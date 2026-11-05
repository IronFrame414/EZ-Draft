// EZD-203 · T21 to T23, T25 (vault/plans/EZD-203.md sections 1 steps 2 and 5, 3, 4; AC-EZD-203-3): wall layers in the
// stored schema, the v1 to v2 migration and the v2 sample. Expected values: plan section 3 schema row (materials
// stud, drywall, tile_backer; strict layer; at least one; sum = thickness within 1/64", 03g rows 2-3), Decided
// "Migration of a v1 wall" and step 5 (4 1/2" within 1/64" gets drywall 1/2" + stud 3 1/2" + drywall 1/2"; any
// other thickness one stud layer of that thickness; other objects unchanged), 03b rule 5, EZD-202 fixture row
// (16 objects: 2 floor, 8 wall, 4 opening, 2 room); T25: step 5, security review round 1, strict wallDataSchema.
import { describe, expect, it } from 'vitest';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { deepFreeze, v1Object } from '../walls/test-utils/fixtures';
import { CURRENT_SCHEMA_VERSION, migrateStoredObject } from './migrate';
import { parseModelDocument, parseStoredObject, type StoredObject } from './index';
import v1 from './samples/v1.json';
import v2 from './samples/v2.json';

type Rec = Record<string, unknown>;
type Layer = { material: string; thickness: number };

const DEFAULT_LAYERS: Layer[] = [
  { material: 'drywall', thickness: 0.5 },
  { material: 'stud', thickness: 3.5 },
  { material: 'drywall', thickness: 0.5 },
];

const v2Objects = () => structuredClone((v2 as unknown as { objects: StoredObject[] }).objects);
const v2Wall = (): StoredObject => {
  const found = v2Objects().find((o) => o.type === 'wall');
  if (!found) throw new Error('samples/v2.json has no wall');
  return found;
};
const attrsOf = (o: StoredObject | null): Rec =>
  ((o?.data as Rec | null | undefined)?.attributes ?? {}) as Rec;
const layersOf = (o: StoredObject | null): Layer[] => attrsOf(o).layers as Layer[];
const sum = (layers: Layer[]) => layers.reduce((s, l) => s + l.thickness, 0);

describe('EZD-203 walls core: wall layers schema', () => {
  it('EZD-203 T21 layer schema: layers must be known materials, positive, strict, and sum to the thickness', () => {
    const cases: [string, (a: Rec) => void, 'ok' | 'invalid_data'][] = [
      [
        'layers sum 5, thickness 4.5',
        (a) =>
          void (a.layers = [
            { material: 'drywall', thickness: 0.5 },
            { material: 'stud', thickness: 4 },
            { material: 'drywall', thickness: 0.5 },
          ]),
        'invalid_data',
      ],
      ['layers []', (a) => void (a.layers = []), 'invalid_data'],
      ['material brick', (a) => void ((a.layers as Rec[])[0].material = 'brick'), 'invalid_data'],
      [
        'a layer of thickness 0',
        (a) => void (a.layers as Rec[]).push({ material: 'drywall', thickness: 0 }),
        'invalid_data',
      ],
      ['layer extra key', (a) => void ((a.layers as Rec[])[0].extra = 1), 'invalid_data'],
      ['no layers', (a) => void delete a.layers, 'invalid_data'],
      ['thickness 4.515625, default layers', (a) => void (a.thickness = 4.515625), 'ok'],
      ['thickness 4.5157, default layers', (a) => void (a.thickness = 4.5157), 'invalid_data'],
    ];
    for (const [name, mutate, want] of cases) {
      const wall = v2Wall();
      expect(wall.schema_version, name).toBe(2);
      mutate(attrsOf(wall));
      const r = parseStoredObject(wall);
      if (want === 'ok') expect(r.ok, name).toBe(true);
      else expect(r, name).toEqual({ ok: false, issue: { id: wall.id, issue: 'invalid_data' } });
    }
  });

  it('EZD-203 T22 migrate v1: a 4 1/2" wall gets the default layers, another thickness one stud layer', () => {
    const w45 = deepFreeze(v1Object('wall', 4.5));
    const w6 = deepFreeze(v1Object('wall', 6));
    const wNear = deepFreeze(v1Object('wall', 4.515625));
    const opening = deepFreeze(v1Object('opening'));
    const nullData = deepFreeze({ ...v1Object('wall'), data: null });

    const m45 = migrateStoredObject(w45);
    const m6 = migrateStoredObject(w6);
    const mNear = migrateStoredObject(wNear);
    const mOpening = migrateStoredObject(opening);
    const mNull = migrateStoredObject(nullData);

    for (const m of [m45, m6, mNear, mOpening, mNull]) expect(m?.schema_version).toBe(2);
    expect(layersOf(m45)).toEqual(DEFAULT_LAYERS);
    expect(layersOf(m6)).toEqual([{ material: 'stud', thickness: 6 }]);
    expect(layersOf(mNear)).toEqual(DEFAULT_LAYERS);
    expect(mOpening?.data).toEqual(opening.data);
    expect(mNull?.data).toBeNull();
    expect(parseStoredObject(nullData)).toEqual({
      ok: false,
      issue: { id: nullData.id, issue: 'invalid_data' },
    });
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  it('EZD-203 T23 samples: v2.json parses with 16 objects and layered walls; v1.json migrates to it', () => {
    const r = parseModelDocument(structuredClone(v2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const objects = r.document.objects;
    const count = (t: string) => objects.filter((o) => o.type === t).length;
    expect(objects).toHaveLength(16);
    expect(count('floor')).toBe(2);
    expect(count('wall')).toBe(8);
    expect(count('opening')).toBe(4);
    expect(count('room')).toBe(2);
    for (const o of objects) {
      if (o.type !== 'wall') continue;
      const a = o.data.attributes as unknown as { thickness: number; layers: Layer[] };
      expect(Math.abs(sum(a.layers) - a.thickness), o.id).toBeLessThanOrEqual(
        COMPARISON_TOLERANCE_IN,
      );
    }

    const fromV1 = structuredClone((v1 as unknown as { objects: StoredObject[] }).objects).map(
      (o) => migrateStoredObject(o),
    );
    expect(fromV1).toEqual(v2Objects());
  });

  it('EZD-203 T25 deep data: 100,000-deep save data is refused as invalid_data without a throw; migration shares it', () => {
    // Built by a loop, alternating { a: v } and [v]; never frozen, cloned or compared whole.
    const deep = (): unknown => {
      let v: unknown = 0;
      for (let i = 0; i < 100000; i++) v = i % 2 === 0 ? { a: v } : [v];
      return v;
    };

    const onData = v1Object('wall', 4.5);
    const dataExtra = deep();
    (onData.data as Rec).extra = dataExtra;
    const onAttrs = v1Object('wall', 4.5);
    attrsOf(onAttrs).extra = deep();

    for (const [name, obj] of [
      ['data.extra', onData],
      ['data.attributes.extra', onAttrs],
    ] as const) {
      let r: ReturnType<typeof parseStoredObject> | undefined;
      expect(() => {
        r = parseStoredObject(obj);
      }, name).not.toThrow();
      expect(r, name).toEqual({ ok: false, issue: { id: obj.id, issue: 'invalid_data' } });
    }

    let migrated: StoredObject | null = null;
    expect(() => {
      migrated = migrateStoredObject(onData);
    }).not.toThrow();
    expect(((migrated as StoredObject | null)?.data as Rec | undefined)?.extra).toBe(dataExtra);
    expect(attrsOf(onData)).not.toHaveProperty('layers');
  });
});
