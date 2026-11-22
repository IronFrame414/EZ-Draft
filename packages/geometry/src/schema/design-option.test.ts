// EZD-1009 the `design_option` type (03c design_option: group, label A/B/C, name, model_delta, status draft / sent /
// approved / archived; 03b rule 4: model_delta is add, replace and remove patches by object id; S07 Validation:
// at most three options A/B/C; vault/build/assumptions.md EZD-1009 rows).
import { describe, expect, it } from 'vitest';
import { createWallData } from '../walls/wall';
import {
  CURRENT_SCHEMA_VERSION,
  DESIGN_OPTION_LABELS,
  DESIGN_OPTIONS_MAX,
  OBJECT_TYPES,
  fileRefs,
  hasLevel,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
} from './index';

const FLOOR = '11111111-1111-4111-8111-111111111111';
const OPTION = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const WALL = '44444444-4444-4444-8444-444444444444';
const PIN = '55555555-5555-4555-8555-555555555555';
const PHOTO = '66666666-6666-4666-8666-666666666666';

const wallData = (x: number) => {
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x, y: 0 }, level: FLOOR });
  if (!made.ok) throw new Error('wall data');
  return made.data;
};
const option = (over: Record<string, unknown> = {}) => ({
  groupId: GROUP,
  groupName: 'Beams',
  label: 'B',
  name: 'Box beams',
  status: 'draft',
  modelDelta: [] as unknown[],
  ...over,
});
const parse = (data: Record<string, unknown>) =>
  parseStoredObject({
    id: OPTION,
    type: 'design_option',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
const ok = (data: Record<string, unknown>) => parse(data).ok;

describe('EZD-1009 design_option schema', () => {
  it('is a model object type that names no level, at most three labels A, B and C', () => {
    expect(OBJECT_TYPES).toContain('design_option');
    expect(DESIGN_OPTION_LABELS).toEqual(['A', 'B', 'C']);
    expect(DESIGN_OPTIONS_MAX).toBe(3);
    const parsed = parse(option());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(hasLevel(parsed.object)).toBe(false);
    expect(ok({ ...option(), label: 'D' })).toBe(false);
    expect(ok({ ...option(), level: FLOOR })).toBe(false);
  });

  it('status is draft, sent, approved or archived', () => {
    for (const status of ['draft', 'sent', 'approved', 'archived'])
      expect(ok(option({ status }))).toBe(true);
    expect(ok(option({ status: 'chosen' }))).toBe(false);
  });

  it('name and group name are typed text', () => {
    expect(ok(option({ name: '  ' }))).toBe(false);
    expect(ok(option({ groupName: '' }))).toBe(false);
    expect(ok(option({ name: 'x'.repeat(121) }))).toBe(false);
    expect(ok(option({ groupId: 'beams' }))).toBe(false);
  });

  it('a patch is add, replace or remove by object id; add and replace objects pass their own schema', () => {
    const wall = { id: WALL, type: 'wall', data: wallData(120) };
    expect(ok(option({ modelDelta: [{ op: 'replace', object: wall }] }))).toBe(true);
    expect(ok(option({ modelDelta: [{ op: 'add', object: wall }] }))).toBe(true);
    expect(ok(option({ modelDelta: [{ op: 'remove', id: WALL }] }))).toBe(true);
    expect(ok(option({ modelDelta: [{ op: 'move', id: WALL }] }))).toBe(false);
    // A wall with a broken shape, an unknown type, or an option inside an option is refused.
    const bad = { ...wall, data: { ...wall.data, level: 'not-a-floor' } };
    expect(ok(option({ modelDelta: [{ op: 'replace', object: bad }] }))).toBe(false);
    expect(ok(option({ modelDelta: [{ op: 'add', object: { ...wall, type: 'sofa' } }] }))).toBe(
      false,
    );
    const nested = { id: WALL, type: 'design_option', data: option() };
    expect(ok(option({ modelDelta: [{ op: 'add', object: nested }] }))).toBe(false);
  });

  it('one patch per object id', () => {
    const wall = { id: WALL, type: 'wall', data: wallData(120) };
    expect(
      ok(
        option({
          modelDelta: [
            { op: 'replace', object: wall },
            { op: 'remove', id: WALL },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('holds the file ids of its patched objects for the save check', () => {
    const pin = {
      id: PIN,
      type: 'pin',
      data: {
        geometry: { point: { x: 10, y: 10 } },
        status: 'existing',
        level: FLOOR,
        attributes: { kind: 'protect', photoFileId: PHOTO },
      },
    };
    const parsed = parse(option({ modelDelta: [{ op: 'add', object: pin }] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(fileRefs(parsed.object as ModelObject)).toEqual([{ fileId: PHOTO, kinds: ['photo'] }]);
  });

  it('a model document holding options with no level parses whole', () => {
    const doc = {
      objects: [
        {
          id: FLOOR,
          type: 'floor',
          schema_version: CURRENT_SCHEMA_VERSION,
          data: { name: 'First', order: 1 },
        },
        {
          id: OPTION,
          type: 'design_option',
          schema_version: CURRENT_SCHEMA_VERSION,
          data: option(),
        },
      ],
    };
    expect(parseModelDocument(doc).ok).toBe(true);
  });
});
