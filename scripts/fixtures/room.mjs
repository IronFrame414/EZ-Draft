// EZD-016b Step 2 (vault/plans/EZD-016b.md): the synthetic 12' x 10' room, one definition used by
// every writer. Model units are decimal inches (03 rule 5). Plan axes: x east, y north; the origin
// is the south-west interior corner. Every value is from the plan's Step 2 table and its
// "Fixture values" table; they are test data, not product values (KNOWN-LIMITS item 5).

/**
 * @typedef {{ wall: 'S', offset: number, width: number }} Opening
 * @typedef {{
 *   units: 'in',
 *   interior: { width: number, depth: number },
 *   wallThickness: number,
 *   door: Opening & { height: number, swingDeg: number },
 *   window: Opening & { sill: number, head: number },
 *   ceiling: { heightAtWest: number, rise: number, run: number },
 * }} Room
 */

/** @type {Room} */
export const room = Object.freeze({
  units: 'in',
  interior: Object.freeze({ width: 144, depth: 120 }),
  wallThickness: 4.5,
  door: Object.freeze({ wall: 'S', offset: 12, width: 36, height: 80, swingDeg: 90 }),
  window: Object.freeze({ wall: 'S', offset: 84, width: 36, sill: 42, head: 102 }),
  ceiling: Object.freeze({ heightAtWest: 96, rise: 4, run: 12 }),
});

/**
 * Ceiling height at plan x (inches): rises east at rise:run, level along y (Step 2).
 * @param {Room} r
 * @param {number} x
 */
export function ceilingHeight(r, x) {
  return r.ceiling.heightAtWest + (x * r.ceiling.rise) / r.ceiling.run;
}
