// EZD-513 (AC-EZD-513-1, -2; S05 "Tag text is generated, not free text"; Q-0704 soffit dropHeight): the
// `ceiling_shape` (tray, coffer, crown) and `ceiling_tag` types are new types at the current version; a tag stores
// its point only, never text.
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseStoredObject } from './index';
import v7 from './samples/v7.json';

const F1 = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const BOUNDARY = [
  { x: 12, y: 12 },
  { x: 132, y: 12 },
  { x: 132, y: 108 },
];

const shape = (attributes: unknown) => ({
  id: ID,
  type: 'ceiling_shape',
  schema_version: CURRENT_SCHEMA_VERSION,
  data: { geometry: { roomId: ROOM, boundary: BOUNDARY }, status: 'new', level: F1, attributes },
});
const tag = (attributes: unknown) => ({
  id: ID,
  type: 'ceiling_tag',
  schema_version: CURRENT_SCHEMA_VERSION,
  data: { geometry: { point: { x: 72, y: 60 } }, status: 'new', level: F1, attributes },
});

describe('EZD-513 ceiling_shape and ceiling_tag', () => {
  it('are new types at the current version, so stored models still parse', () => {
    expect(OBJECT_TYPES).toContain('ceiling_shape');
    expect(OBJECT_TYPES).toContain('ceiling_tag');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect((v7 as { schemaVersion?: number }).schemaVersion ?? 7).toBe(7);
  });

  it('a tray, coffer or crown is an outline on a room with a positive depth', () => {
    for (const kind of ['tray', 'coffer', 'crown'])
      expect(parseStoredObject(shape({ kind, depth: 12 })).ok).toBe(true);
    expect(parseStoredObject(shape({ kind: 'soffit', depth: 12 })).ok).toBe(false);
    expect(parseStoredObject(shape({ kind: 'tray', depth: 0 })).ok).toBe(false);
    expect(parseStoredObject(shape({ kind: 'tray' })).ok).toBe(false);
  });

  it('a tag stores its point only: text is refused', () => {
    expect(parseStoredObject(tag({})).ok).toBe(true);
    expect(parseStoredObject(tag({ text: 'CLG 8\' 0"' })).ok).toBe(false);
  });
});
