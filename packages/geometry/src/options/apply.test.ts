// EZD-1009 AC-EZD-1009-2 (03b rule 4: an option's model_delta is applied over the working model in memory for
// display and never saved into it; a patch whose base object is deleted is flagged and skipped; vault/build/
// assumptions.md EZD-1009 "Patch form"). Expected values are the fixture's own numbers.
import { describe, expect, it } from 'vitest';
import { createWallData } from '../walls/wall';
import type { DesignOptionData, ModelObject } from '../schema';
import { applyDesignOption } from './apply';

const FLOOR = '11111111-1111-4111-8111-111111111111';
const WALL_1 = '22222222-2222-4222-8222-222222222222';
const WALL_2 = '33333333-3333-4333-8333-333333333333';
const WALL_NEW = '44444444-4444-4444-8444-444444444444';
const GONE = '55555555-5555-4555-8555-555555555555';
const OPTION = '66666666-6666-4666-8666-666666666666';

const wallData = (x: number) => {
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x, y: 0 }, level: FLOOR });
  if (!made.ok) throw new Error('wall data');
  return made.data;
};

const deepFreeze = <T>(v: T): T => {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
};

const working = (): ModelObject[] => [
  { id: FLOOR, type: 'floor', data: { name: 'First floor', order: 1 } },
  { id: WALL_1, type: 'wall', data: wallData(144) },
  { id: WALL_2, type: 'wall', data: wallData(96) },
];

const delta = (modelDelta: DesignOptionData['modelDelta']) => ({ modelDelta });

const endX = (objects: ModelObject[], id: string) => {
  const o = objects.find((x) => x.id === id);
  return o?.type === 'wall' ? o.data.geometry.end.x : undefined;
};

describe('EZD-1009 applying an option', () => {
  it('AC-2 option B changes the displayed model and leaves the working copy unchanged', () => {
    const saved = deepFreeze(working());
    const before = JSON.parse(JSON.stringify(saved)) as ModelObject[];
    const optionB = deepFreeze(
      delta([
        { op: 'replace', object: { id: WALL_1, type: 'wall', data: wallData(180) } },
        { op: 'remove', id: WALL_2 },
        { op: 'add', object: { id: WALL_NEW, type: 'wall', data: wallData(60) } },
      ]),
    );

    const shown = applyDesignOption(saved, optionB);

    expect(shown.skipped).toEqual([]);
    expect(shown.objects.map((o) => o.id)).toEqual([FLOOR, WALL_1, WALL_NEW]);
    expect(endX(shown.objects, WALL_1)).toBe(180);
    expect(endX(shown.objects, WALL_NEW)).toBe(60);
    // The working copy is as it was: wall 1 still ends at 144 and wall 2 is still there.
    expect(saved).toEqual(before);
    expect(endX(saved, WALL_1)).toBe(144);
    expect(endX(saved, WALL_2)).toBe(96);
    // An object no patch touches is the same object.
    expect(shown.objects[0]).toBe(saved[0]);
  });

  it('option A (no patches) shows the working model', () => {
    const saved = working();
    const shown = applyDesignOption(saved, delta([]));
    expect(shown).toEqual({ objects: saved, skipped: [] });
    expect(shown.objects).not.toBe(saved);
  });

  it('a patch whose base object is deleted is flagged and skipped; the rest still apply', () => {
    const shown = applyDesignOption(
      working(),
      delta([
        { op: 'replace', object: { id: GONE, type: 'wall', data: wallData(200) } },
        { op: 'remove', id: GONE },
        { op: 'add', object: { id: WALL_2, type: 'wall', data: wallData(10) } },
        { op: 'replace', object: { id: WALL_1, type: 'wall', data: wallData(150) } },
      ]),
    );
    expect(shown.skipped).toEqual([
      { index: 0, op: 'replace', id: GONE },
      { index: 1, op: 'remove', id: GONE },
      { index: 2, op: 'add', id: WALL_2 },
    ]);
    expect(endX(shown.objects, WALL_1)).toBe(150);
    expect(endX(shown.objects, WALL_2)).toBe(96);
    expect(shown.objects).toHaveLength(3);
  });

  it('a patch never reaches a design option object', () => {
    const optionObject = {
      id: OPTION,
      type: 'design_option',
      data: {
        groupId: FLOOR,
        groupName: 'Beams',
        label: 'A',
        name: 'Current',
        status: 'draft',
        modelDelta: [],
      },
    } as ModelObject;
    const shown = applyDesignOption(
      [...working(), optionObject],
      delta([{ op: 'remove', id: OPTION }]),
    );
    expect(shown.skipped).toEqual([{ index: 0, op: 'remove', id: OPTION }]);
    expect(shown.objects).toContain(optionObject);
  });
});
