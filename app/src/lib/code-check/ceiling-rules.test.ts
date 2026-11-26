// EZD-612 (AC-EZD-612-2 "A bath-clearance warning (EZD-228) and a fan-clearance warning (EZD-515) appear in the same
// list"; AC-EZD-611a-2 "with missing data it returns cannot-check instead of passing"): the ceiling rules are in the
// app registry beside the bath rules, so one Check run lists both. Expected values: EZD-228 (a toilet centerline
// 14 1/2" from a side wall against the 15" code minimum, 09d:34) and EZD-515 (a 52" fan centred 40" from a wall face
// leaves 40 - 26 = 14" against an 18" clearance, worked in fan-clearance.test.ts).
import { describe, expect, it } from 'vitest';
import { runCodeCheck, type ModelObject, type Point } from '@ezdraft/geometry';
import { BATH_CLEARANCE_RULE_IDS } from '@ezdraft/geometry/checks';
import {
  chain,
  roomObj,
  uid,
  F1,
} from '../../../../packages/geometry/src/rooms/test-utils/fixtures';
import { CODE_EDITIONS } from '../code-edition/editions';
import { codeCheckDefaults } from '../defaults/check-values';
import { CEILING_RULE_IDS, FAN_CLEARANCE_NEED, FAN_CLEARANCE_PROJECT_KEY } from './ceiling-rules';
import { appRuleRegistry } from './registry';

const TOILET = uid(901);
const FAN = uid(951);
const BATH: Point[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 96 },
  { x: 0, y: 96 },
];
const BED: Point[] = [
  { x: 200, y: 0 },
  { x: 344, y: 0 },
  { x: 344, y: 120 },
  { x: 200, y: 120 },
];
const toilet = {
  id: TOILET,
  type: 'fixture',
  data: {
    geometry: { center: { x: 14.5, y: 82 }, axis: { x: 1, y: 0 } },
    status: 'new',
    level: F1,
    attributes: { kind: 'toilet', width: 20, depth: 28 },
  },
} as ModelObject;
const fan = {
  id: FAN,
  type: 'device',
  data: {
    geometry: { point: { x: 260, y: 40 } },
    status: 'new',
    level: F1,
    attributes: { kind: 'ceiling_fan' },
  },
} as ModelObject;
const model = {
  objects: [
    ...chain(1, BATH, 'right'),
    roomObj(uid(900), BATH, 'Bath 2'),
    toilet,
    ...chain(10, BED, 'right'),
    roomObj(uid(950), BED, 'Bedroom'),
    fan,
  ],
};
const run = (project: Record<string, unknown>) =>
  runCodeCheck({
    model,
    edition: 'fbc9_nec2023',
    registry: appRuleRegistry(),
    verifiedRuleIds: new Set(),
    project,
  });

describe('EZD-612 ceiling rules in the app registry', () => {
  it('are registered for every edition', () => {
    for (const edition of CODE_EDITIONS)
      expect(appRuleRegistry().ruleIds(edition)).toEqual(
        expect.arrayContaining(Object.values(CEILING_RULE_IDS)),
      );
  });

  it('AC-EZD-612-2 a bath clearance warning and a fan clearance warning are in the same run', () => {
    const results = run({ ...codeCheckDefaults({ fan_blade_clearance: 18 }) });
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: BATH_CLEARANCE_RULE_IDS.side,
          objectId: TOILET,
          status: 'fail',
          severity: 'warning',
        }),
        expect.objectContaining({
          ruleId: CEILING_RULE_IDS.fanClearance,
          objectId: FAN,
          status: 'fail',
          severity: 'warning',
          values: expect.objectContaining({ against: 'wall', measured: 14, required: 18 }),
        }),
      ]),
    );
  });

  it('the Defaults fan clearance reaches the rule; Not set is cannot-check, never a pass', () => {
    expect(codeCheckDefaults({ fan_blade_clearance: 18 })[FAN_CLEARANCE_PROJECT_KEY]).toBe(18);
    expect(codeCheckDefaults({})).not.toHaveProperty(FAN_CLEARANCE_PROJECT_KEY);
    const fanResults = run(codeCheckDefaults({})).filter(
      (r) => r.ruleId === CEILING_RULE_IDS.fanClearance,
    );
    expect(fanResults).toEqual([
      expect.objectContaining({ status: 'cannot_check', need: FAN_CLEARANCE_NEED, objectId: FAN }),
    ]);
  });

  it('a fan clear of the clearance gives no result', () => {
    const clear = run({ [FAN_CLEARANCE_PROJECT_KEY]: 14 }).filter(
      (r) => r.ruleId === CEILING_RULE_IDS.fanClearance,
    );
    expect(clear).toEqual([]);
  });
});
