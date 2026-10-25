// EZD-103b U7, U12 (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Expected values: plan section 4 rows U7 and U12; section 1 Decided "Unsaved prompt" (Q-0228, Q-0302),
// "Browser Back" (3), (4) (Q-0265 (b)); NEXT-AR (`__NA` is added by Next.js to the history state).
import { describe, expect, it, vi } from 'vitest';
import type { ConfirmChoice, ConfirmOptions } from '../states/confirm-controller';
import { confirmLeave, handleHistoryBack, isOriginEntry } from './unsaved-changes';
import type { UnsavedEntry } from './unsaved-changes';

const ASK_OPTIONS = {
  title: 'office.settings.unsaved_title',
  confirmLabel: 'office.settings.unsaved_save',
  discardLabel: 'office.settings.unsaved_discard',
};

type Saving = 'true' | 'false' | 'throws';

// One shared call log, so the order of save, clearDraft and go/back/rearm can be checked.
function setup(choice: ConfirmChoice, saving: Saving = 'true') {
  const log: string[] = [];
  const ask = vi.fn<(options: ConfirmOptions) => Promise<ConfirmChoice>>(async () => {
    log.push('ask');
    return choice;
  });
  const save = vi.fn(async () => {
    log.push('save');
    if (saving === 'throws') throw new Error('save failed');
    return saving === 'true';
  });
  const clearDraft = vi.fn(() => {
    log.push('clearDraft');
  });
  const go = vi.fn(() => {
    log.push('go');
  });
  const back = vi.fn(() => {
    log.push('back');
  });
  const rearm = vi.fn(() => {
    log.push('rearm');
  });
  const entry = (dirty: boolean): UnsavedEntry => ({ dirty, save, clearDraft });
  return { log, ask, save, clearDraft, go, back, rearm, entry };
}

const expectAskedOnce = (ask: ReturnType<typeof setup>['ask']) => {
  expect(ask).toHaveBeenCalledTimes(1);
  expect(ask.mock.calls[0]).toStrictEqual([ASK_OPTIONS]);
};

describe('EZD-103b unsaved changes helpers', () => {
  describe('U7 confirmLeave', () => {
    it('U7 (a) entry null: left, go once, no ask', async () => {
      const s = setup('confirm');
      await expect(confirmLeave(null, s.ask, s.go)).resolves.toBe('left');
      expect(s.go).toHaveBeenCalledTimes(1);
      expect(s.ask).toHaveBeenCalledTimes(0);
    });

    it('U7 (b) not dirty: left, go once, no ask, no clearDraft', async () => {
      const s = setup('confirm');
      await expect(confirmLeave(s.entry(false), s.ask, s.go)).resolves.toBe('left');
      expect(s.go).toHaveBeenCalledTimes(1);
      expect(s.ask).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
    });

    it('U7 (c) dirty + cancel: stayed, nothing else', async () => {
      const s = setup('cancel');
      await expect(confirmLeave(s.entry(true), s.ask, s.go)).resolves.toBe('stayed');
      expect(s.go).toHaveBeenCalledTimes(0);
      expect(s.save).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
      expectAskedOnce(s.ask);
    });

    it('U7 (d) dirty + discard: left, no save, clearDraft once before go once', async () => {
      const s = setup('discard');
      await expect(confirmLeave(s.entry(true), s.ask, s.go)).resolves.toBe('left');
      expect(s.save).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(1);
      expect(s.go).toHaveBeenCalledTimes(1);
      expect(s.log).toEqual(['ask', 'clearDraft', 'go']);
      expectAskedOnce(s.ask);
    });

    it('U7 (e) dirty + confirm, save true: left, order save, clearDraft, go', async () => {
      const s = setup('confirm', 'true');
      await expect(confirmLeave(s.entry(true), s.ask, s.go)).resolves.toBe('left');
      expect(s.log).toEqual(['ask', 'save', 'clearDraft', 'go']);
      expectAskedOnce(s.ask);
    });

    it('U7 (f) dirty + confirm, save false: stayed, no go, no clearDraft', async () => {
      const s = setup('confirm', 'false');
      await expect(confirmLeave(s.entry(true), s.ask, s.go)).resolves.toBe('stayed');
      expect(s.go).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
      expectAskedOnce(s.ask);
    });

    it('U7 (g) dirty + confirm, save throws: stayed, no go, no clearDraft', async () => {
      const s = setup('confirm', 'throws');
      await expect(confirmLeave(s.entry(true), s.ask, s.go)).resolves.toBe('stayed');
      expect(s.go).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
      expectAskedOnce(s.ask);
    });
  });

  describe('U12 history helpers', () => {
    it('U12 (a) entry null: left, back once, no rearm, no ask', async () => {
      const s = setup('confirm');
      await expect(handleHistoryBack(null, s.ask, s.back, s.rearm)).resolves.toBe('left');
      expect(s.back).toHaveBeenCalledTimes(1);
      expect(s.rearm).toHaveBeenCalledTimes(0);
      expect(s.ask).toHaveBeenCalledTimes(0);
    });

    it('U12 (b) not dirty: left, back once, no rearm, no ask', async () => {
      const s = setup('confirm');
      await expect(handleHistoryBack(s.entry(false), s.ask, s.back, s.rearm)).resolves.toBe('left');
      expect(s.back).toHaveBeenCalledTimes(1);
      expect(s.rearm).toHaveBeenCalledTimes(0);
      expect(s.ask).toHaveBeenCalledTimes(0);
    });

    it('U12 (c) dirty + cancel: stayed, no back, rearm once, no clearDraft', async () => {
      const s = setup('cancel');
      await expect(handleHistoryBack(s.entry(true), s.ask, s.back, s.rearm)).resolves.toBe(
        'stayed',
      );
      expect(s.back).toHaveBeenCalledTimes(0);
      expect(s.rearm).toHaveBeenCalledTimes(1);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
    });

    it('U12 (d) dirty + discard: left, back once, no rearm, clearDraft once', async () => {
      const s = setup('discard');
      await expect(handleHistoryBack(s.entry(true), s.ask, s.back, s.rearm)).resolves.toBe('left');
      expect(s.back).toHaveBeenCalledTimes(1);
      expect(s.rearm).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(1);
    });

    it('U12 (e) dirty + confirm, save true: left, back once, no rearm, clearDraft once', async () => {
      const s = setup('confirm', 'true');
      await expect(handleHistoryBack(s.entry(true), s.ask, s.back, s.rearm)).resolves.toBe('left');
      expect(s.back).toHaveBeenCalledTimes(1);
      expect(s.rearm).toHaveBeenCalledTimes(0);
      expect(s.clearDraft).toHaveBeenCalledTimes(1);
    });

    it('U12 (f) dirty + confirm, save false: stayed, no back, rearm once, no clearDraft', async () => {
      const s = setup('confirm', 'false');
      await expect(handleHistoryBack(s.entry(true), s.ask, s.back, s.rearm)).resolves.toBe(
        'stayed',
      );
      expect(s.back).toHaveBeenCalledTimes(0);
      expect(s.rearm).toHaveBeenCalledTimes(1);
      expect(s.clearDraft).toHaveBeenCalledTimes(0);
    });

    it('U12 isOriginEntry', () => {
      expect(isOriginEntry({ ezdOrigin: 'a' }, 'a')).toBe(true);
      expect(isOriginEntry({ ezdOrigin: 'b' }, 'a')).toBe(false);
      expect(isOriginEntry(null, 'a')).toBe(false);
      expect(isOriginEntry({}, 'a')).toBe(false);
      expect(isOriginEntry({ ezdOrigin: 'a', __NA: true }, 'a')).toBe(true);
      expect(isOriginEntry({ ezdOrigin: null }, null)).toBe(false);
    });
  });
});
