// EZD-228 (AC-EZD-228-1; AC-EZD-228-2 "Check lists it once EZD-612 exists"): the bath clearance rules are in the
// app's rule registry for both editions, so the Check run (checkProject, EZD-612's button) lists them, and they read
// their values from Defaults. Expected values: 09d:34 and B-07 (the Defaults value starts at the code minimum, a
// toilet centerline 15" from a side wall); assumptions EZD-228 (at 14 1/2" it warns).
import { describe, expect, it } from 'vitest';
import { runCodeCheck } from '@ezdraft/geometry';
import { BATH_CLEARANCE_RULE_IDS, BATH_CLEARANCES_PROJECT_KEY } from '@ezdraft/geometry/checks';
import { chain, roomObj, uid, F1 } from '../../../../packages/geometry/src/rooms/test-utils/fixtures';
import type { ModelObject } from '@ezdraft/geometry';
import { CODE_EDITIONS } from '../code-edition/editions';
import { codeCheckDefaults } from '../defaults/check-values';
import { appRuleRegistry } from './registry';

const IDS = Object.values(BATH_CLEARANCE_RULE_IDS);
const TOILET = uid(901);
const BOX = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 96 },
  { x: 0, y: 96 },
];
const toilet = (x: number): ModelObject =>
  ({
    id: TOILET,
    type: 'fixture',
    data: {
      geometry: { center: { x, y: 82 }, axis: { x: 1, y: 0 } },
      status: 'new',
      level: F1,
      attributes: { kind: 'toilet', width: 20, depth: 28 },
    },
  }) as ModelObject;
const model = (x: number) => ({ objects: [...chain(1, BOX, 'right'), roomObj(uid(900), BOX, 'Bath 2'), toilet(x)] });

describe('EZD-228 bath clearance rules in the app registry', () => {
  it('are registered for every edition', () => {
    for (const edition of CODE_EDITIONS) expect(appRuleRegistry().ruleIds(edition)).toEqual(expect.arrayContaining(IDS));
  });

  it('Defaults give the code minimums when nothing is stored, and a stored project copy is not needed', () => {
    expect(codeCheckDefaults({})[BATH_CLEARANCES_PROJECT_KEY]).toMatchObject({ side: 15, front: 21 });
  });

  it('a toilet 14 1/2" from the side wall warns with the Defaults values; 15" does not', () => {
    const run = (x: number) =>
      runCodeCheck({
        model: model(x),
        edition: 'fbc9_nec2023',
        registry: appRuleRegistry(),
        verifiedRuleIds: new Set(),
        project: codeCheckDefaults({}),
      }).filter((r) => r.ruleId === BATH_CLEARANCE_RULE_IDS.side);
    expect(run(14.5)).toEqual([
      expect.objectContaining({ status: 'fail', severity: 'warning', objectId: TOILET, values: expect.objectContaining({ measured: 14.5, required: 15 }) }),
    ]);
    expect(run(15)).toEqual([]);
  });
});
