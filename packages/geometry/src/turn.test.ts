// EZD-209 G1-G4 (vault/plans/EZD-209.md section 4).
import { describe, test, expect } from 'vitest';
import { parseTurnAngle, resolveTurnDirection, TURN_REFUSED_MESSAGE_KEY } from './turn';
import { resolveTurnDirection as fromIndex } from './index';

const near = (got: { x: number; y: number } | null, x: number, y: number) => {
  expect(got).not.toBeNull();
  expect(got!.x).toBeCloseTo(x, 12);
  expect(got!.y).toBeCloseTo(y, 12);
};

describe('EZD-209 turn angle module', () => {
  test('EZD-209 G1 turn after a wall', () => {
    expect(fromIndex).toBe(resolveTurnDirection);
    const p = { x: 1, y: 0 };
    near(resolveTurnDirection({ previous: p, toCursor: { x: 0, y: 5 }, turnDeg: 90 }), 0, 1);
    near(resolveTurnDirection({ previous: p, toCursor: { x: 0, y: -5 }, turnDeg: 90 }), 0, -1);
    near(
      resolveTurnDirection({ previous: p, toCursor: { x: 3, y: 3 }, turnDeg: 45 }),
      0.7071067811865476,
      0.7071067811865476,
    );
    near(resolveTurnDirection({ previous: p, toCursor: { x: 0, y: 5 }, turnDeg: 0 }), 1, 0);
    near(
      resolveTurnDirection({ previous: p, toCursor: { x: 5, y: 1 }, turnDeg: 12.5 }),
      0.9762960071199334,
      0.21643961393810288,
    );
    near(
      resolveTurnDirection({ previous: { x: 0, y: 10 }, toCursor: { x: -3, y: 2 }, turnDeg: 90 }),
      -1,
      0,
    );
  });

  test('EZD-209 G2 first wall', () => {
    near(resolveTurnDirection({ previous: null, toCursor: { x: 2, y: 6 }, turnDeg: 90 }), 0, 1);
    near(resolveTurnDirection({ previous: null, toCursor: { x: 2, y: -6 }, turnDeg: 90 }), 0, -1);
    near(resolveTurnDirection({ previous: null, toCursor: { x: -5, y: 1 }, turnDeg: 0 }), -1, 0);
    near(resolveTurnDirection({ previous: null, toCursor: { x: 5, y: 1 }, turnDeg: 0 }), 1, 0);
    near(
      resolveTurnDirection({ previous: { x: 0, y: 0 }, toCursor: { x: 2, y: 6 }, turnDeg: 90 }),
      0,
      1,
    );
  });

  test('EZD-209 G3 nothing typed', () => {
    near(
      resolveTurnDirection({ previous: { x: 1, y: 0 }, toCursor: { x: 3, y: 4 }, turnDeg: null }),
      0.6,
      0.8,
    );
    expect(
      resolveTurnDirection({ previous: { x: 1, y: 0 }, toCursor: { x: 0, y: 0 }, turnDeg: null }),
    ).toBeNull();
  });

  test('EZD-209 G4 angle parse', () => {
    expect(TURN_REFUSED_MESSAGE_KEY).toBe('office.typed.angle_refused');
    const ok: Array<[string, number]> = [
      ['0', 0],
      ['45', 45],
      ['90', 90],
      ['12.5', 12.5],
      [' 90 ', 90],
      ['179.9', 179.9],
    ];
    for (const [text, deg] of ok) {
      expect(parseTurnAngle(text), text).toEqual({ ok: true, degrees: deg });
    }
    const bad = ['180', '200', '-90', '', 'abc', '90°', '1e2', '.5', '12.', '1'.repeat(17)];
    for (const text of bad) {
      expect(parseTurnAngle(text), text).toEqual({
        ok: false,
        messageKey: 'office.typed.angle_refused',
      });
    }
  });
});
