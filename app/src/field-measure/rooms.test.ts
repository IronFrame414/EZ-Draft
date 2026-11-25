// EZD-1419 (S17b Shape picker "Changing shape after measuring asks to confirm and keeps matching walls"; Validation
// "a value outside 0–200 ft asks to confirm"). Matching walls are the walls with the same letter
// (vault/build/assumptions.md EZD-1419). Expected values: a 12' x 10' rectangle (A 144", B 120", C 144", D 120")
// changed to an L keeps A to D and leaves E and F empty; an L changed to a rectangle keeps A to D; Walls starts a new
// outline. A confirmed 250' (3000") is a valid stored length; over 1000 ft (12000") is not.
import { describe, expect, it } from 'vitest';
import { emptyRoom, isMeasured, roomSchema, withShape, type FieldRoom } from './rooms';

const rect = (): FieldRoom => ({
  ...withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle'),
  lengths: [144, 120, 144, 120],
  ceiling: 96,
});

describe('EZD-1419 changing the shape keeps matching walls', () => {
  it('rectangle to L keeps A to D, E and F are empty, the ceiling stays', () => {
    const l = withShape(rect(), 'l');
    expect(l.shape).toBe('l');
    expect(l.lengths).toEqual([144, 120, 144, 120, null, null]);
    expect(l.ceiling).toBe(96);
    expect(roomSchema.safeParse(l).success).toBe(true);
  });

  it('L to rectangle keeps A to D; U (eight walls) to T keeps all eight', () => {
    const l = {
      ...withShape(emptyRoom('r1', 'room', 'Family'), 'l'),
      lengths: [218, 108.5, 124.5, 87, 93.5, 195.5],
    };
    expect(withShape(l, 'rectangle').lengths).toEqual([218, 108.5, 124.5, 87]);
    const u = {
      ...withShape(emptyRoom('r2', 'room', 'Bath'), 'u'),
      lengths: [1, 2, 3, 4, 5, 6, 7, 8],
    };
    expect(withShape(u, 't').lengths).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('Walls starts a new outline with no walls', () => {
    const w = withShape(rect(), 'walls');
    expect(w).toMatchObject({ shape: 'walls', corners: [], closed: false, lengths: [] });
  });

  it('a room is measured once any wall has a length', () => {
    expect(isMeasured(withShape(emptyRoom('r1', 'room', 'Kitchen'), 'rectangle'))).toBe(false);
    expect(isMeasured(emptyRoom('r1', 'room', 'Kitchen'))).toBe(false);
    expect(isMeasured({ ...rect(), lengths: [null, null, 144, null] })).toBe(true);
  });

  it("a confirmed 250' is stored; over 1000 ft is not", () => {
    expect(roomSchema.safeParse({ ...rect(), lengths: [3000, 120, 3000, 120] }).success).toBe(true);
    expect(roomSchema.safeParse({ ...rect(), lengths: [12001, 120, 144, 120] }).success).toBe(
      false,
    );
  });
});
