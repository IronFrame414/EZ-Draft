// EZD-103b U15 (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Expected values: plan section 4 row U15; section 1 Decided "Draft store" (a failure is reported with
// location settings.draft and the method resolves; read resolves null); section 3 "IndexedDB" (database
// ezdraft-settings-drafts, store drafts). Node 22 has no IndexedDB global.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/errors/capture', () => ({ captureBrowserError: vi.fn() }));

import { captureBrowserError } from '../../lib/errors/capture';
import { SETTINGS_DRAFT_DB, SETTINGS_DRAFT_STORE, createIdbDraftStore } from './draft-store';

const capture = vi.mocked(captureBrowserError);

describe('EZD-103b draft store without IndexedDB', () => {
  it('U15 every method resolves and reports one error with location settings.draft', async () => {
    expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
    expect(SETTINGS_DRAFT_DB).toBe('ezdraft-settings-drafts');
    expect(SETTINGS_DRAFT_STORE).toBe('drafts');

    const s = createIdbDraftStore();
    await expect(s.read('m1:company')).resolves.toBeNull();
    await expect(s.write('m1:company', { value: 1 })).resolves.toBeUndefined();
    await expect(s.clear('m1:company')).resolves.toBeUndefined();

    expect(capture).toHaveBeenCalledTimes(3);
    for (const [error, location] of capture.mock.calls) {
      expect(error).toBeInstanceOf(Error);
      expect(location).toBe('settings.draft');
    }
  });
});
