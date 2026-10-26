// EZD-001 · T1 (AC-EZD-001-2): the geometry package loads in a runtime with no DOM (vault/plans/EZD-001.md Tests T1;
// ticket Done when; 02 Stack "no UI code"; 11 Where each output is produced). The only @smoke test of this ticket (Step 6.1).
import { describe, test, expect } from 'vitest';
import * as geometry from './index';

describe('EZD-001 geometry package', () => {
  test('done when: loads with no DOM @smoke', () => {
    expect(typeof geometry).toBe('object');
    expect(typeof Reflect.get(globalThis, 'document')).toBe('undefined');
    expect(typeof Reflect.get(globalThis, 'window')).toBe('undefined');
  });
});
