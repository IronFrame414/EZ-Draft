// EZD-603 (AC-EZD-603-1 "The toggle shows the note on the plan for that device only."; S06 Controls "Device height note
// toggle ... Shows a height note (e.g. "MW +66"") on the plan for that device. | Off by default."; board S06Electrical
// "Height notes Off / On"; vault/build/assumptions.md EZD-603). Expected text is the spec's own example.
import { CURRENT_SCHEMA_VERSION, type DrawingItem, type ModelObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { existingDetailItems, planDetailItems } from './details-drawing';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const A = '00000000-0000-4000-8000-000000000603';
const B = '00000000-0000-4000-8000-000000000604';

const device = (id: string, x: number, attributes: Record<string, unknown>): ModelObject =>
  ({
    id,
    type: 'device',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { point: { x, y: 10 } },
      status: 'new',
      level: LEVEL,
      attributes: { kind: 'receptacle_duplex', heightLabel: 'MW', height: 66, ...attributes },
    },
  }) as unknown as ModelObject;

const notes = (items: DrawingItem[]) =>
  items.filter((i): i is Extract<DrawingItem, { kind: 'text' }> => i.kind === 'text');

describe('EZD-603 device height notes on the plan', () => {
  it('the toggle shows the note on the plan for that device only (AC-EZD-603-1)', () => {
    const items = existingDetailItems(
      [device(A, 0, { heightNote: true }), device(B, 50, { heightNote: false })],
      10.5,
    );
    const text = notes(items);
    expect(text).toHaveLength(1);
    expect(text[0]!.text).toBe('MW +66"');
    expect(text[0]!.objectId).toBe(A);
    expect(text[0]!.layer).toBe('new');
    // Beside the symbol, to its right.
    expect(text[0]!.at.y).toBe(10);
    expect(text[0]!.at.x).toBeGreaterThan(0);
  });

  it('off by default: a device with no toggle stored draws no note', () => {
    expect(notes(existingDetailItems([device(A, 0, {})], 10.5))).toHaveLength(0);
  });

  it('with no label the note is the height alone; with no height there is no note', () => {
    expect(
      notes(existingDetailItems([device(A, 0, { heightNote: true, heightLabel: null })], 10.5))[0]!
        .text,
    ).toBe('+66"');
    expect(
      notes(existingDetailItems([device(A, 0, { heightNote: true, height: null })], 10.5)),
    ).toHaveLength(0);
  });

  it('a switch or a light gets its note too, beside its own letters', () => {
    const sw = device(A, 0, { kind: 'switch_single', heightNote: true, heightLabel: null, height: 48 });
    const text = notes(existingDetailItems([sw], 10.5)).map((t) => t.text);
    expect(text).toEqual(['+48"', 'S']);
    const light = device(B, 0, { kind: 'recessed_light', heightNote: true, heightLabel: null });
    expect(notes(existingDetailItems([light], 10.5)).map((t) => t.text)).toEqual(['+66"']);
  });

  it('the left panel Height notes Off hides every note; On shows them', () => {
    const objs = [device(A, 0, { heightNote: true }), device(B, 50, { heightNote: true })];
    expect(notes(planDetailItems(objs, LEVEL, 10.5, { heightNotes: false }))).toHaveLength(0);
    expect(notes(planDetailItems(objs, LEVEL, 10.5, { heightNotes: true }))).toHaveLength(2);
    expect(notes(planDetailItems(objs, LEVEL, 10.5))).toHaveLength(2);
  });
});
