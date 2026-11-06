// EZD-205b · CL1 to CL5: closure reports per wall chain (vault/plans/EZD-205b.md section 1 Decided "Level and
// walls", "Wall ends", "Components", "Walk order", "Gap", "Kind", "Display", "Gap boundary", "Parallel"; section 4;
// AC-EZD-205-2, AC-EZD-205-3). Expected values: 09j Closure rows 1-9; 09j Keep out of square (120 SF); 03g rows 2-3
// and the halfway rule; Q-0559; Q-0568; Q-0569 (b), (c); Q-0570.
import { describe, expect, it } from 'vitest';
import type { Point } from '../schema';
import { outlineAreaSqIn, roomAreaSqFt } from './area';
import { findClosures, GAP_LIMIT_IN, type ClosureReport, type GapReport } from './closure';
import { chain, F1, F2, openChain, uid, wallObj } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROW2_PTS = [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0.5)];
const ROW2 = openChain(1, ROW2_PTS);
const withLast = (last: Point) => openChain(1, [...ROW2_PTS.slice(0, 4), last]);
const IDS4 = [uid(1), uid(2), uid(3), uid(4)];

function expectPoint(got: Point, want: Point, label = 'point'): void {
  expect(got.x, `${label} x`).toBeCloseTo(want.x, 12);
  expect(got.y, `${label} y`).toBeCloseTo(want.y, 12);
}

function onlyGap(reports: ClosureReport[], label: string): GapReport {
  expect(reports, label).toHaveLength(1);
  const r = reports[0]!;
  expect(r.kind, label).toBe('gap');
  return r as GapReport;
}

function onlyOpen(
  reports: ClosureReport[],
  label: string,
): Extract<ClosureReport, { kind: 'open' }> {
  expect(reports, label).toHaveLength(1);
  const r = reports[0]!;
  expect(r.kind, label).toBe('open');
  return r as Extract<ClosureReport, { kind: 'open' }>;
}

function expectRow2Report(reports: ClosureReport[], label: string): void {
  const g = onlyGap(reports, label);
  expect(g.wallIds, label).toEqual(IDS4);
  expectPoint(g.gap, P(0, -0.5), `${label} gap`);
  expect(g.sizeIn, label).toBe(0.5);
  expect(g.displayIn, label).toBe(0.5);
  expect(g.parallelWallIds, label).toEqual([uid(2), uid(4)]);
  expect(outlineAreaSqIn(g.boundary), label).toBeCloseTo(17280, 6);
  expect(roomAreaSqFt(g.boundary), label).toBe(120);
}

describe('EZD-205b closure reports', () => {
  it('CL1 closed and gap rows (09j Closure 1-4, 8)', () => {
    expect(GAP_LIMIT_IN).toBe(12);

    const row1 = findClosures(chain(1, [P(0, 0), P(144, 0), P(144, 120), P(0, 120)]), F1);
    expect(row1).toEqual([{ kind: 'closed', wallIds: IDS4 }]);

    expectRow2Report(findClosures(ROW2, F1), 'row 2');

    const row3 = onlyGap(findClosures(withLast(P(0, 0.0625)), F1), 'row 3');
    expect(row3.displayIn).toBe(0.0625);

    const row4 = onlyGap(findClosures(withLast(P(0, 12)), F1), 'row 4');
    expect(row4.sizeIn).toBe(12);
    expect(row4.displayIn).toBe(12);

    const row8 = onlyGap(findClosures(withLast(P(0, 0.02)), F1), 'row 8');
    expect(row8.sizeIn).toBe(0.02);
    expect(row8.displayIn).toBe(0.0625);
  });

  it('CL2 open rows (09j Closure 5, 7, 9) and empty input', () => {
    const row5 = onlyOpen(findClosures(withLast(P(0, 12.0625)), F1), 'row 5');
    expect(row5.wallIds).toEqual(IDS4);
    expectPoint(row5.gap, P(0, -12.0625), 'row 5 gap');
    expect(row5.sizeIn).toBe(12.0625);

    const row7 = onlyOpen(
      findClosures(openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(8.5, 120), P(8.5, 8.5)]), F1),
      'row 7',
    );
    expect(row7.sizeIn).toBeCloseTo(12.020815280171307, 12);

    const oneWall = onlyOpen(findClosures(openChain(1, [P(0, 0), P(10, 0)]), F1), 'row 9 one');
    expect(oneWall.sizeIn).toBe(10);
    const twoWalls = onlyOpen(
      findClosures(openChain(1, [P(0, 0), P(6, 0), P(6, 6)]), F1),
      'row 9 two',
    );
    expect(twoWalls.sizeIn).toBeCloseTo(8.48528137423857, 12);

    expect(findClosures([], F1)).toEqual([]);
  });

  it('CL3 parallel walls: a miss both ways offers none, an angled wall along the gap is offered', () => {
    const row6 = onlyGap(
      findClosures(openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(0.5, 120), P(0.5, 0.5)]), F1),
      'row 6',
    );
    expectPoint(row6.gap, P(-0.5, -0.5), 'row 6 gap');
    expect(row6.sizeIn).toBeCloseTo(0.7071067811865476, 12);
    expect(row6.displayIn).toBe(0.6875);
    expect(row6.parallelWallIds).toEqual([]);

    const angled = onlyGap(
      findClosures(openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(0.6, 0.5)]), F1),
      'angled',
    );
    expectPoint(angled.gap, P(-0.6, -0.5), 'angled gap');
    expect(angled.parallelWallIds).toEqual([uid(3)]);
  });

  it('CL4 grid boundaries at 1/64", 1/32" and 3/32"', () => {
    expect(findClosures(withLast(P(0, 0.015625)), F1)).toEqual([{ kind: 'closed', wallIds: IDS4 }]);
    expect(onlyGap(findClosures(withLast(P(0, 0.03125)), F1), '1/32').displayIn).toBe(0.0625);
    expect(onlyGap(findClosures(withLast(P(0, 0.09375)), F1), '3/32').displayIn).toBe(0.125);
  });

  it('CL5 walk order, reversed walls, branches, partitions and levels', () => {
    const reversed = ROW2.map((w) =>
      w.id === uid(2) ? wallObj(uid(2), P(144, 120), P(144, 0), 'left') : w,
    );
    expectRow2Report(findClosures(reversed, F1), '(a)');

    const shuffled = [ROW2[2]!, ROW2[0]!, ROW2[3]!, ROW2[1]!];
    expectRow2Report(findClosures(shuffled, F1), '(b)');

    expect(findClosures([...ROW2, wallObj(uid(9), P(144, 0), P(200, -50))], F1)).toEqual([]);

    const d = onlyGap(
      findClosures([...ROW2, wallObj(uid(8), P(72, 0), P(72, 120), 'center')], F1),
      '(d)',
    );
    expect(d.wallIds).toEqual(IDS4);
    expect(outlineAreaSqIn(d.boundary)).toBeCloseTo(8370, 6);

    expect(findClosures(openChain(1, ROW2_PTS, 'right', F2), F1)).toEqual([]);
  });
});
