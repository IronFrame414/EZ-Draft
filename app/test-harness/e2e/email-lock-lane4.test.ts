// EZD-2001 (AC-EZD-2001-1): lane 4 gets its own e2e email lock folder, like lanes 1-3; lane 5 is not a lane.
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { lockPathFor } from './email-lock';

describe('EZD-2001 email lock folder for lane 4', () => {
  test('EZD_LANE=4 uses ezdraft-e2e-locks-lane4; 3 is unchanged; 5 falls back to the lane-0 folder', () => {
    const saved = process.env.EZD_LANE;
    const folder = () => path.basename(path.dirname(lockPathFor('a@x.test')));
    try {
      process.env.EZD_LANE = '4';
      expect(folder()).toBe('ezdraft-e2e-locks-lane4');
      process.env.EZD_LANE = '3';
      expect(folder()).toBe('ezdraft-e2e-locks-lane3');
      process.env.EZD_LANE = '5';
      expect(folder()).toBe('ezdraft-e2e-locks');
    } finally {
      if (saved === undefined) delete process.env.EZD_LANE;
      else process.env.EZD_LANE = saved;
    }
  });
});
