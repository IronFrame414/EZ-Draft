// EZD-015a · U10 (vault/plans/EZD-015a.md Section 4).
// Sources: S01 States (Retry, Offline); S01 wizard "Cancel"; boards' aria-label="Close"; Q-0030 (a); R24 #40.
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';

const E = en as Record<string, unknown>;
const S = es as Record<string, unknown>;

describe('EZD-015a state messages', () => {
  it('EZD-015a done when: Retry, Offline, Cancel and Close are in English and Spanish', () => {
    expect(E['common.retry']).toBe('Retry');
    expect(E['common.offline']).toBe('Offline');
    expect(E['common.cancel']).toBe('Cancel');
    expect(E['common.close']).toBe('Close');
    for (const k of ['common.retry', 'common.offline', 'common.cancel', 'common.close']) {
      const v = S[k];
      expect(typeof v, k).toBe('string');
      expect((v as string).trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toBe(E[k]);
    }
  });
});
