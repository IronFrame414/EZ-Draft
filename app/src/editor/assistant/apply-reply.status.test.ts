// EZD-214 (AC-EZD-214-8, -1; 05 Q-0664 "AI commands"; Q-0638; Q-0474). Expected values: Q-0664 (set_status {ref,
// status} previewed as an update; AI remove stays the Delete key), S03 Status bar "View" (Proposed: new objects are
// New), S03 Inspector (a bearing wall is not set to Demo) and EZD-5604a C2 (status on an update is refused).
import {
  CURRENT_SCHEMA_VERSION,
  NO_NUMBERS,
  createOpeningData,
  parseStoredObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { assistantChangeSchema, type AssistantChange } from '../../lib/assistant/changes';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { ASSISTANT_SYSTEM_PROMPT } from '../../server/assistant/assistant';
import { deleteChanges } from '../edit/edit-changes';
import type { Objects } from '../model/patches';
import { baseObjects, F1, idSeq, uid, withWalls } from '../tools/test-utils/fixtures';
import { applyAssistantReply, type AssistantPreview, type OkPreview } from './apply-reply';

function room(): Map<string, ObjectValue> {
  const m = withWalls(
    baseObjects(),
    1,
    [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    true,
  );
  const v = m.get(uid(1))!;
  const r = parseStoredObject({
    id: uid(1),
    type: v.type,
    schema_version: v.schemaVersion,
    data: v.data,
  });
  if (!r.ok || r.object.type !== 'wall') throw new Error('wall');
  m.set(uid(20), {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: createOpeningData({
      kind: 'door',
      host: r.object,
      center: { x: 72, y: 0 },
    }) as unknown as Record<string, unknown>,
  });
  return m;
}

const REFS = { f1: F1, w1: uid(1), w2: uid(2), w3: uid(3), w4: uid(4), o1: uid(20) };

const run = (
  changes: unknown[],
  o: { objects?: Objects; status?: 'existing' | 'new' } = {},
): AssistantPreview =>
  applyAssistantReply({
    objects: o.objects ?? room(),
    floorId: F1,
    changes: changes as AssistantChange[],
    refs: REFS,
    highs: NO_NUMBERS,
    newId: idSeq(100),
    ...(o.status ? { status: o.status } : {}),
  });

function ok(p: AssistantPreview): OkPreview {
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  return p;
}

const statusIn = (p: OkPreview, id: string) =>
  (p.changes.find((c) => c.id === id)?.value?.data as { status?: string } | undefined)?.status;

describe('EZD-214 assistant set_status', () => {
  it('the change format takes set_status {ref, status} and nothing more', () => {
    expect(
      assistantChangeSchema.safeParse({ op: 'set_status', ref: 'w1', status: 'demo' }).success,
    ).toBe(true);
    for (const bad of [
      { op: 'set_status', ref: 'w1', status: 'gone' },
      { op: 'set_status', ref: 'w1' },
      { op: 'set_status', ref: 'w1', status: 'new', type: 'wall' },
      { op: 'update', type: 'wall', ref: 'w1', status: 'demo' },
    ])
      expect(assistantChangeSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it('AC-8 set_status on a wall and a door is previewed as updates, one object each, no cascade', () => {
    const p = ok(
      run([
        { op: 'set_status', ref: 'w1', status: 'demo' },
        { op: 'set_status', ref: 'o1', status: 'new' },
      ]),
    );
    expect(p.updated.map((id) => id.toLowerCase()).sort()).toEqual([uid(1), uid(20)].sort());
    expect(p.added).toEqual([]);
    expect(p.removed).toEqual([]);
    expect(statusIn(p, uid(1))).toBe('demo');
    expect(statusIn(p, uid(20))).toBe('new');
    expect(p.changes).toHaveLength(2);
  });

  it('a status already held changes nothing; a room or floor ref is the wrong type; an unknown ref is refused', () => {
    const same = run([{ op: 'set_status', ref: 'w1', status: 'existing' }]);
    expect(same.ok && same.changes).toEqual([]);
    expect(run([{ op: 'set_status', ref: 'f1', status: 'new' }])).toEqual({
      ok: false,
      reason: 'wrong_type',
    });
    expect(run([{ op: 'set_status', ref: 'w9', status: 'new' }])).toEqual({
      ok: false,
      reason: 'unknown_ref',
    });
    expect(
      run([
        { op: 'set_status', ref: 'w1', status: 'new' },
        { op: 'set_status', ref: 'w1', status: 'demo' },
      ]),
    ).toEqual({ ok: false, reason: 'duplicate_ref' });
  });

  it('a bearing wall is not set to Demo', () => {
    const objects = room();
    const v = objects.get(uid(1))!;
    const attrs = v.data.attributes as Record<string, unknown>;
    objects.set(uid(1), { ...v, data: { ...v.data, attributes: { ...attrs, bearing: true } } });
    expect(run([{ op: 'set_status', ref: 'w1', status: 'demo' }], { objects })).toEqual({
      ok: false,
      reason: 'invalid_value',
    });
  });

  it('AC-8 an AI remove still acts as the Delete key', () => {
    const objects = room();
    const p = ok(run([{ op: 'remove', type: 'door', ref: 'o1' }], { objects }));
    expect(p.removed.map((id) => id.toLowerCase())).toEqual([uid(20)]);
    expect(p.changes).toEqual(deleteChanges(objects, F1, [uid(20)], idSeq(100)));
  });

  it('AC-1 a wall and a door the assistant adds in Proposed are New, and so is the room they close', () => {
    const p = ok(
      run(
        [
          { op: 'add', type: 'wall', ref: 'n1', start: { x: 72, y: 0 }, end: { x: 72, y: 120 } },
          { op: 'add', type: 'door', ref: 'n2', hostWall: 'w3', center: { x: 36, y: 120 } },
        ],
        { status: 'new' },
      ),
    );
    const added = p.changes.filter((c) => p.added.includes(c.id));
    expect(added.length).toBeGreaterThanOrEqual(2);
    for (const c of added)
      expect((c.value!.data as { status: string }).status, c.value!.type).toBe('new');
    const plain = ok(
      run([{ op: 'add', type: 'wall', ref: 'n1', start: { x: 72, y: 0 }, end: { x: 72, y: 120 } }]),
    );
    for (const c of plain.changes.filter((x) => plain.added.includes(x.id)))
      expect((c.value!.data as { status: string }).status).toBe('existing');
  });

  it('the system prompt names set_status', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('{"op":"set_status","ref":"w1","status":"demo"}');
    expect(ASSISTANT_SYSTEM_PROMPT).not.toContain('Never write status, number');
  });
});
