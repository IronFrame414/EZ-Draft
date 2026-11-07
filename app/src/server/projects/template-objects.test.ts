// EZD-221a U7, U8, U12 (vault/plans/EZD-221a.md section 4; AC-EZD-221-3). Expected values: section 1 Decided
// "buildTemplateObjects" (corners (0,0) (W,0) (W,L) (0,L), +x east, +y north, G/walls/wall.ts:3; thickness side
// from thicknessSideFor of the closed chain, 'right', thickness outside the room, Q-0559, Q-0569 (b); default
// wall of createWallData with height = ceilingHeight, Q-0558; the room data exactly; 4 walls then the room;
// schema_version CURRENT_SCHEMA_VERSION; input not mutated), "Throw outcome" (sizes isTemplateSize accepts never
// throw, G/walls/wall.ts:30-34; Q-0570), Q-0592 (a) (reconcileRooms keeps the room, G/rooms/sync.ts).
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_WALL_LAYERS,
  parseStoredObject,
  reconcileRooms,
  type ModelObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS } from '../../lib/projects/templates';
import { TEMPLATE_LEVEL_PLACEHOLDER, buildTemplateObjects } from './template-objects';

const makeIdSeq = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

type WallRowData = {
  geometry: { start: { x: number; y: number }; end: { x: number; y: number } };
  status: string;
  level: string;
  attributes: { thicknessSide: string; height: number; thickness: number; layers: unknown };
};

describe('EZD-221a buildTemplateObjects', () => {
  it('EZD-221a U7 build L-kitchen: four walls with thickness outside the room, then the room', () => {
    const input = { key: 'l_kitchen' as const, width: 141.5, length: 168, ceilingHeight: 108 };
    const copy = structuredClone(input);
    const rows = buildTemplateObjects(input, makeIdSeq());

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.type)).toEqual(['wall', 'wall', 'wall', 'wall', 'room']);
    expect(rows.map((r) => r.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000005',
    ]);

    const lines = [
      [
        { x: 0, y: 0 },
        { x: 141.5, y: 0 },
      ],
      [
        { x: 141.5, y: 0 },
        { x: 141.5, y: 168 },
      ],
      [
        { x: 141.5, y: 168 },
        { x: 0, y: 168 },
      ],
      [
        { x: 0, y: 168 },
        { x: 0, y: 0 },
      ],
    ];
    rows.slice(0, 4).forEach((row, i) => {
      const d = row.data as unknown as WallRowData;
      expect(d.geometry.start, `wall ${i} start`).toEqual(lines[i][0]);
      expect(d.geometry.end, `wall ${i} end`).toEqual(lines[i][1]);
      expect(d.attributes.thicknessSide).toBe('right');
      expect(d.attributes.height).toBe(108);
      expect(d.attributes.thickness).toBe(4.5);
      expect(d.attributes.layers).toEqual(DEFAULT_WALL_LAYERS);
      expect(d.status).toBe('existing');
    });

    expect(rows[4].data).toEqual({
      geometry: {
        boundary: [
          { x: 0, y: 0 },
          { x: 141.5, y: 0 },
          { x: 141.5, y: 168 },
          { x: 0, y: 168 },
        ],
      },
      status: 'existing',
      level: TEMPLATE_LEVEL_PLACEHOLDER,
      attributes: { name: 'L-kitchen' },
      closureOverride: null,
    });

    for (const row of rows) {
      expect((row.data as { level: string }).level).toBe(TEMPLATE_LEVEL_PLACEHOLDER);
      expect(row.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect(parseStoredObject(row).ok, row.id).toBe(true);
    }
    expect(input).toEqual(copy);
  });

  it('EZD-221a U8 build extremes: every template at 1/16" and at 2400" parses and never throws', () => {
    for (const size of [0.0625, 2400]) {
      for (const key of TEMPLATE_KEYS) {
        let rows: ReturnType<typeof buildTemplateObjects> = [];
        expect(() => {
          rows = buildTemplateObjects({ key, width: size, length: size, ceilingHeight: size });
        }, `${key} ${size}`).not.toThrow();
        expect(rows, `${key} ${size}`).toHaveLength(5);
        for (const row of rows) expect(parseStoredObject(row).ok, `${key} ${size}`).toBe(true);
      }
    }
  });

  it('EZD-221a U12 reconcile keeps the room: no create, update or delete for any template', () => {
    for (const key of TEMPLATE_KEYS) {
      const { width, length } = TEMPLATE_DEFAULTS[key];
      const rows = buildTemplateObjects({ key, width, length, ceilingHeight: 96 }, makeIdSeq());
      const parsed = rows.map((r) => parseStoredObject(r));
      const objects: ModelObject[] = [];
      for (const p of parsed) {
        expect(p.ok, key).toBe(true);
        if (p.ok) objects.push(p.object);
      }
      expect(
        reconcileRooms(objects, TEMPLATE_LEVEL_PLACEHOLDER, () => {
          throw new Error('no new id');
        }),
        key,
      ).toEqual({ create: [], update: [], delete: [] });
    }
  });
});
