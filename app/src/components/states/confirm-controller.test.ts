// EZD-015b · U6 (vault/plans/EZD-015b.md Section 4). Sources: P-Step 6; D-ConfirmController behaviour.
import { describe, expect, it, vi } from 'vitest';
import { createConfirmController } from './confirm-controller';

const A = { title: 'dev.messages.sample', confirmLabel: 'common.retry' } as const;
const B = {
  title: 'dev.messages.greeting',
  params: { name: 'Ana' },
  message: 'dev.messages.sample',
  confirmLabel: 'common.retry',
  cancelLabel: 'dev.messages.sample',
  tone: 'danger',
} as const;

describe('EZD-015b confirm controller', () => {
  it('U6 (a) open then confirm', async () => {
    const c = createConfirmController();
    const p = c.open(A);
    expect(c.getSnapshot()).toEqual({
      id: 1,
      title: 'dev.messages.sample',
      message: null,
      confirmLabel: 'common.retry',
      cancelLabel: 'common.cancel',
      tone: 'primary',
    });
    c.choose('confirm');
    await expect(p).resolves.toBe('confirm');
    expect(c.getSnapshot()).toBeNull();
  });

  it('U6 (b) cancel', async () => {
    const c = createConfirmController();
    const p = c.open(A);
    c.choose('cancel');
    await expect(p).resolves.toBe('cancel');
  });

  it('EZD-015b done when: the confirm dialog returns the pressed choice and a second open cancels the first', async () => {
    const c = createConfirmController();
    const first = c.open(A);
    const second = c.open(B);
    await expect(first).resolves.toBe('cancel');
    const snap = c.getSnapshot();
    expect(snap).toMatchObject({
      id: 2,
      title: 'dev.messages.greeting',
      message: 'dev.messages.sample',
      params: { name: 'Ana' },
      confirmLabel: 'common.retry',
      cancelLabel: 'dev.messages.sample',
      tone: 'danger',
    });
    c.choose('confirm');
    await expect(second).resolves.toBe('confirm');
  });

  it('U6 (d) choose with nothing open does nothing', async () => {
    const c = createConfirmController();
    expect(() => c.choose('cancel')).not.toThrow();
    expect(c.getSnapshot()).toBeNull();
    const p = c.open(A);
    c.choose('confirm');
    c.choose('cancel');
    await expect(p).resolves.toBe('confirm');
  });

  it('U6 (e) subscribe is called on open, open, choose', () => {
    const c = createConfirmController();
    const spy = vi.fn();
    c.subscribe(spy);
    void c.open(A);
    void c.open(B);
    c.choose('confirm');
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
