// EZD-215 (AC-EZD-215-1, -2, -4). Expected values: 09q Bearing warning rows 1-3, 5, 6 (rows 4 and 6 as Q-0708 reads
// them); Q-0704 "one per wall per action"; RC-015 test text "wall.bearing is true AND (status is demo OR a new or
// widened opening exists in it)"; Q-0708 the tick needs both texts.
import { describe, expect, it } from 'vitest';
import { createWallData } from '../walls/wall';
import { parseStoredObject, type ModelObject } from '../schema';
import {
  bearingWarnings,
  canMarkLetterOnFile,
  engineerNoteFor,
  engineerRequired,
  type RuleChange,
} from './bearing';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const W1 = 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45';
const W2 = 'dd95bb08-124b-4347-9069-a741a3766dc8';
const D1 = '05339e81-17bb-4a72-a80a-f0dba166d978';
const N1 = '6a1d1c38-1f8f-4d5e-9d2e-6e0b7f3f0a11';

type Wall = Extract<ModelObject, { type: 'wall' }>;
type Opening = Extract<ModelObject, { type: 'opening' }>;

function wall(
  id: string,
  bearing: boolean,
  status: 'existing' | 'demo' | 'new' = 'existing',
): Wall {
  const r = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level: LEVEL, status });
  if (!r.ok) throw new Error(r.reason);
  return { id, type: 'wall', data: { ...r.data, attributes: { ...r.data.attributes, bearing } } };
}

function door(host: string | null, status: 'existing' | 'demo' | 'new', width = 36): Opening {
  return {
    id: D1,
    type: 'opening',
    data: {
      geometry: { center: { x: 60, y: 0 }, hostWallId: host, axis: null },
      status,
      level: LEVEL,
      attributes: {
        kind: 'door',
        width,
        height: 80,
        roughOpening: { width: width + 2, height: 82 },
        sillHeight: 0,
        swing: 'left',
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    },
  };
}

const map = (...objects: ModelObject[]) => new Map(objects.map((o) => [o.id.toLowerCase(), o]));
const actions = (before: Map<string, ModelObject>, changes: RuleChange[]) =>
  bearingWarnings(before, changes).map((w) => [w.wallId, w.action]);

describe('EZD-215 bearing wall rule', () => {
  it('09q row 1: a bearing wall deleted raises one delete warning with the wall line and level', () => {
    const w = wall(W1, true);
    const out = bearingWarnings(map(w), [{ id: W1, after: null }]);
    expect(out).toEqual([
      {
        wallId: W1,
        action: 'delete',
        line: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
        level: LEVEL,
      },
    ]);
  });

  it('09q row 2: a non-bearing wall deleted raises none', () => {
    expect(actions(map(wall(W1, false)), [{ id: W1, after: null }])).toEqual([]);
  });

  it('09q row 3: set to Demo, then deleted, is one warning per action (2 in all)', () => {
    const w = wall(W1, true);
    const demo = wall(W1, true, 'demo');
    expect(actions(map(w), [{ id: W1, after: demo }])).toEqual([[W1, 'demo']]);
    expect(actions(map(demo), [{ id: W1, after: null }])).toEqual([[W1, 'delete']]);
  });

  it('Demo on a non-bearing wall, a wall already Demo, or a wall set New raises none', () => {
    expect(actions(map(wall(W1, false)), [{ id: W1, after: wall(W1, false, 'demo') }])).toEqual([]);
    expect(
      actions(map(wall(W1, true, 'demo')), [{ id: W1, after: wall(W1, true, 'demo') }]),
    ).toEqual([]);
    expect(actions(map(wall(W1, true)), [{ id: W1, after: wall(W1, true, 'new') }])).toEqual([]);
  });

  it('RC-015: a new opening hosted on a bearing wall raises an opening warning; on a non-bearing wall none', () => {
    expect(actions(map(wall(W1, true)), [{ id: D1, after: door(W1, 'new') }])).toEqual([
      [W1, 'opening'],
    ]);
    expect(actions(map(wall(W1, false)), [{ id: D1, after: door(W1, 'new') }])).toEqual([]);
  });

  it('RC-015 "new-work": an existing or demo opening drawn on a bearing wall raises none', () => {
    expect(actions(map(wall(W1, true)), [{ id: D1, after: door(W1, 'existing') }])).toEqual([]);
    expect(actions(map(wall(W1, true)), [{ id: D1, after: door(W1, 'demo') }])).toEqual([]);
  });

  it('RC-015: an opening widened on a bearing wall warns; moved or narrowed on it, none', () => {
    const before = map(wall(W1, true), door(W1, 'new', 36));
    expect(actions(before, [{ id: D1, after: door(W1, 'new', 42) }])).toEqual([[W1, 'opening']]);
    expect(actions(before, [{ id: D1, after: door(W1, 'new', 30) }])).toEqual([]);
    const moved = door(W1, 'new', 36);
    moved.data.geometry.center = { x: 40, y: 0 };
    expect(actions(before, [{ id: D1, after: moved }])).toEqual([]);
  });

  it('an opening moved onto a bearing wall from another wall is a new opening on it', () => {
    const before = map(wall(W1, true), wall(W2, false), door(W2, 'new'));
    expect(actions(before, [{ id: D1, after: door(W1, 'new') }])).toEqual([[W1, 'opening']]);
  });

  it('the host wall is read after the change: a wall made bearing in the same change counts', () => {
    const before = map(wall(W1, false));
    expect(
      actions(before, [
        { id: W1, after: wall(W1, true) },
        { id: D1, after: door(W1, 'new') },
      ]),
    ).toEqual([[W1, 'opening']]);
  });

  it('Q-0704: one per wall per action, and a change that already carries the note raises no second one', () => {
    const before = map(wall(W1, true), door(W1, 'new', 36));
    const two = { ...door(W1, 'new', 40), id: N1 };
    expect(
      actions(before, [
        { id: D1, after: door(W1, 'new', 42) },
        { id: N1, after: two },
      ]),
    ).toEqual([[W1, 'opening']]);
    const [warning] = bearingWarnings(map(wall(W1, true)), [{ id: W1, after: null }]);
    const note: ModelObject = { id: N1, type: 'engineer_note', data: engineerNoteFor(warning!) };
    expect(
      actions(map(wall(W1, true)), [
        { id: W1, after: null },
        { id: N1, after: note },
      ]),
    ).toEqual([]);
  });

  it('the note it adds parses, is existing, starts with the warning on and empty texts (Q-0704, Q-0708)', () => {
    const [warning] = bearingWarnings(map(wall(W1, true)), [{ id: W1, after: null }]);
    const data = engineerNoteFor(warning!);
    const r = parseStoredObject({ id: N1, type: 'engineer_note', schema_version: 6, data });
    expect(r.ok).toBe(true);
    expect(data.status).toBe('existing');
    expect(data.attributes).toEqual({
      wallId: W1,
      action: 'delete',
      engineerName: '',
      approvedText: '',
      fileId: null,
      letterOnFile: false,
    });
    expect(engineerRequired(data)).toBe(true);
  });

  it('09q rows 5, 6 (Q-0708): the tick needs both texts; only the tick clears the warning', () => {
    expect(canMarkLetterOnFile({ engineerName: '', approvedText: 'Header 2-2x12' })).toBe(false);
    expect(canMarkLetterOnFile({ engineerName: 'A. Engineer', approvedText: '  ' })).toBe(false);
    expect(
      canMarkLetterOnFile({ engineerName: 'A. Engineer', approvedText: 'Header 2-2x12' }),
    ).toBe(true);
    const [warning] = bearingWarnings(map(wall(W1, true)), [{ id: W1, after: null }]);
    const filled = engineerNoteFor(warning!);
    filled.attributes.engineerName = 'A. Engineer';
    filled.attributes.approvedText = 'Header 2-2x12';
    expect(engineerRequired(filled)).toBe(true);
    filled.attributes.letterOnFile = true;
    expect(engineerRequired(filled)).toBe(false);
  });
});
