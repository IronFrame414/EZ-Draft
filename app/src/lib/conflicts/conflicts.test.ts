// EZD-299a T7 (vault/plans/EZD-299a.md section 4; AC-EZD-299-15). Expected values: Decided D-Labels (the label
// key per type, the number as a parameter, text for a named room or floor, `other` for anything else).
import { describe, expect, it } from 'vitest';
import { objectLabel } from './conflicts';

const NS = 'office.conflicts.object.';
const wall = (attributes: Record<string, unknown>) => ({ type: 'wall', data: { attributes } });
const opening = (attributes: Record<string, unknown>) => ({
  type: 'opening',
  data: { attributes },
});

describe('EZD-299a objectLabel', () => {
  it('EZD-299a T7 walls and openings carry their number, or read unnumbered', () => {
    expect(objectLabel(wall({ number: 4 }))).toMatchObject({
      key: `${NS}wall`,
      params: { number: 4 },
    });
    expect(objectLabel({ type: 'wall', data: { attributes: {} } })).toMatchObject({
      key: `${NS}wall_unnumbered`,
    });
    expect(objectLabel(wall({ number: 0 }))).toMatchObject({ key: `${NS}wall_unnumbered` });
    expect(objectLabel(opening({ kind: 'door', number: 2 }))).toMatchObject({
      key: `${NS}door`,
      params: { number: 2 },
    });
    expect(objectLabel(opening({ kind: 'window', number: 3 }))).toMatchObject({
      key: `${NS}window`,
      params: { number: 3 },
    });
    expect(objectLabel(opening({ kind: 'arch' }))).toMatchObject({ key: `${NS}other` });
  });

  it('EZD-299a T7 rooms and floors read their name, or unnamed', () => {
    expect(objectLabel({ type: 'room', data: { attributes: { name: 'Room 2' } } })).toEqual({
      text: 'Room 2',
    });
    expect(objectLabel({ type: 'room', data: { attributes: {} } })).toMatchObject({
      key: `${NS}room_unnamed`,
    });
    expect(objectLabel({ type: 'floor', data: { name: 'Floor 1', order: 1 } })).toEqual({
      text: 'Floor 1',
    });
    expect(objectLabel({ type: 'floor', data: { order: 1 } })).toMatchObject({
      key: `${NS}floor_unnamed`,
    });
  });

  it('EZD-299a T7 any other type and a missing value read as other', () => {
    expect(objectLabel({ type: 'cabinet', data: {} })).toMatchObject({ key: `${NS}other` });
    expect(objectLabel(null)).toMatchObject({ key: `${NS}other` });
  });
});
