// EZD-216 (AC-EZD-216-7 "The AI change format gains add_text and add_dimension"; AC-EZD-216-8 status and level; Q-0687
// (b) note text; 09-calculations Q-0664 "two points equal within 1/64" place nothing", rows 1-2 (150" reads 12' 6")).
// Expected values come from those rows, not from running the code.
import { NO_NUMBERS, measureDimension, dimensionText, type DimensionData } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { assistantChangeSchema, type AssistantChange } from '../../lib/assistant/changes';
import { ASSISTANT_SYSTEM_PROMPT } from '../../server/assistant/assistant';
import type { Objects } from '../model/patches';
import { baseObjects, F1, idSeq, uid, withWalls } from '../tools/test-utils/fixtures';
import { applyAssistantReply, type AssistantPreview, type OkPreview } from './apply-reply';

const room = (): Objects =>
  withWalls(
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

const REFS = { f1: F1, w1: uid(1), w2: uid(2) };

const run = (changes: unknown[], status?: 'existing' | 'new'): AssistantPreview =>
  applyAssistantReply({
    objects: room(),
    floorId: F1,
    changes: changes as AssistantChange[],
    refs: REFS,
    highs: NO_NUMBERS,
    newId: idSeq(100),
    ...(status ? { status } : {}),
  });

function ok(p: AssistantPreview): OkPreview {
  if (!p.ok) throw new Error(`refused: ${p.reason}`);
  return p;
}

const dataOf = (p: OkPreview, id: string) => p.changes.find((c) => c.id === id)?.value;

describe('EZD-216 assistant add_text', () => {
  it('places a note with its text, no leader, 3/32" and the phase status on the floor', () => {
    const p = ok(
      run(
        [{ op: 'add_text', ref: 'n1', position: { x: 30, y: 40 }, text: 'VERIFY IN FIELD' }],
        'new',
      ),
    );
    expect(p.added).toEqual([uid(100)]);
    const v = dataOf(p, uid(100))!;
    expect(v.type).toBe('text');
    expect(v.data).toEqual({
      geometry: { position: { x: 30, y: 40 }, leader: null },
      status: 'new',
      level: F1,
      attributes: { text: 'VERIFY IN FIELD', paperSize: '3/32' },
    });
  });

  it('takes a leader, a paper size and several lines with á é ñ ü ° ½', () => {
    const p = ok(
      run([
        {
          op: 'add_text',
          ref: 'n1',
          floor: 'f1',
          position: { x: 30, y: 40 },
          leader: { x: 0, y: 60 },
          paperSize: '1/8',
          text: 'Baño ½"\nfan 90°',
        },
      ]),
    );
    const d = dataOf(p, uid(100))!.data as {
      geometry: unknown;
      status: string;
      attributes: unknown;
    };
    expect(d.geometry).toEqual({ position: { x: 30, y: 40 }, leader: { x: 0, y: 60 } });
    expect(d.status).toBe('existing');
    expect(d.attributes).toEqual({ text: 'Baño ½"\nfan 90°', paperSize: '1/8' });
  });

  it('refuses empty text, more than 500 characters and characters the plan cannot draw', () => {
    const at = { x: 0, y: 0 };
    expect(run([{ op: 'add_text', ref: 'n1', position: at, text: '  ' }])).toEqual({
      ok: false,
      reason: 'invalid_value',
    });
    expect(run([{ op: 'add_text', ref: 'n1', position: at, text: 'x'.repeat(501) }]).ok).toBe(
      false,
    );
    expect(run([{ op: 'add_text', ref: 'n1', position: at, text: 'x'.repeat(500) }]).ok).toBe(true);
    expect(run([{ op: 'add_text', ref: 'n1', position: at, text: 'price €5' }]).ok).toBe(false);
    expect(
      assistantChangeSchema.safeParse({
        op: 'add_text',
        ref: 'n1',
        position: at,
        text: 'a',
        status: 'new',
      }).success,
    ).toBe(false);
  });
});

describe('EZD-216 assistant add_dimension', () => {
  it('two points 150" apart place a linear dimension reading 12\' 6"', () => {
    const p = ok(
      run(
        [
          {
            op: 'add_dimension',
            ref: 'n1',
            from: { x: 0, y: -24 },
            to: { x: 150, y: -24 },
            offset: -12,
          },
        ],
        'new',
      ),
    );
    const v = dataOf(p, uid(100))!;
    expect(v.type).toBe('dimension');
    const d = v.data as unknown as DimensionData;
    expect(d).toEqual({
      geometry: { kind: 'points', from: { x: 0, y: -24 }, to: { x: 150, y: -24 } },
      status: 'new',
      level: F1,
      attributes: { kind: 'linear', offset: -12, override: null, auto: null, room: null },
    });
    const m = measureDimension(d, { wall: () => null, roomBox: () => null, floorBox: () => null });
    expect(m === null ? null : dimensionText(d, m)).toBe(`12' 6"`);
  });

  it('a wall face of a sent wall, or of a wall this reply adds', () => {
    const p = ok(run([{ op: 'add_dimension', ref: 'n1', wall: 'w1', face: 'left' }]));
    const d = dataOf(p, uid(100))!.data as unknown as DimensionData;
    expect(d.geometry).toEqual({ kind: 'wall_face', wallId: uid(1), face: 'left' });
    expect(d.attributes.offset).toBe(0);

    const q = ok(
      run([
        { op: 'add', type: 'wall', ref: 'n1', start: { x: 0, y: 200 }, end: { x: 96, y: 200 } },
        { op: 'add_dimension', ref: 'n2', wall: 'n1', face: 'right', override: 'EQ' },
      ]),
    );
    const dim = q.changes.find((c) => c.value?.type === 'dimension')!.value!
      .data as unknown as DimensionData;
    expect(dim.geometry).toEqual({ kind: 'wall_face', wallId: uid(100), face: 'right' });
    expect(dim.attributes.override).toBe('EQ');
  });

  it('refuses two points within 1/64", an unknown wall, another floor and two places at once', () => {
    expect(
      run([{ op: 'add_dimension', ref: 'n1', from: { x: 0, y: 0 }, to: { x: 0.01, y: 0 } }]),
    ).toEqual({ ok: false, reason: 'invalid_value' });
    expect(run([{ op: 'add_dimension', ref: 'n1', wall: 'w9', face: 'left' }])).toEqual({
      ok: false,
      reason: 'unknown_ref',
    });
    expect(
      run([
        { op: 'add_dimension', ref: 'n1', floor: 'w1', from: { x: 0, y: 0 }, to: { x: 9, y: 0 } },
      ]),
    ).toEqual({ ok: false, reason: 'other_floor' });
    const both = {
      op: 'add_dimension',
      ref: 'n1',
      from: { x: 0, y: 0 },
      to: { x: 9, y: 0 },
      wall: 'w1',
      face: 'left',
    };
    expect(assistantChangeSchema.safeParse(both).success).toBe(false);
    expect(
      assistantChangeSchema.safeParse({ op: 'add_dimension', ref: 'n1', wall: 'w1' }).success,
    ).toBe(false);
    expect(
      run([{ op: 'add_dimension', ref: 'w1', from: { x: 0, y: 0 }, to: { x: 9, y: 0 } }]),
    ).toEqual({
      ok: false,
      reason: 'duplicate_ref',
    });
  });

  it('a one-line override; a cleared override is the measured value', () => {
    const at = { from: { x: 0, y: 0 }, to: { x: 90, y: 0 } };
    const p = ok(run([{ op: 'add_dimension', ref: 'n1', ...at, override: '  ' }]));
    expect((dataOf(p, uid(100))!.data as unknown as DimensionData).attributes.override).toBeNull();
    expect(run([{ op: 'add_dimension', ref: 'n1', ...at, override: 'x'.repeat(101) }]).ok).toBe(
      false,
    );
  });

  it('the prompt teaches both changes', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('"op":"add_text"');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('"op":"add_dimension"');
  });
});
