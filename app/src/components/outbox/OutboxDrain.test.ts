// EZD-120d U10 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-1, -2; Decided "Office drain"). The drain
// module is loaded with `loadOfficeDrain`: a failed import (a lost chunk) answers null and never rejects, so the
// layout keeps working; a good import answers the module.
import { describe, expect, it } from 'vitest';
import { loadFieldDrain, loadOfficeDrain } from './OutboxDrain';

describe('EZD-120d office drain import', () => {
  it('U10 a rejecting loader answers null without rejecting', async () => {
    await expect(loadOfficeDrain(() => Promise.reject(new Error('chunk')))).resolves.toBeNull();
  });

  it('U10 a resolving loader answers the module', async () => {
    const m = { startDrain: () => null, sendBeforeSignOut: async () => 'sent' };
    await expect(
      loadOfficeDrain(() =>
        Promise.resolve(m as unknown as typeof import('../../lib/outbox/office-drain')),
      ),
    ).resolves.toBe(m);
  });
});

// EZD-1998 (AC-EZD-1998-2): the field sender loads on its own (lib/outbox/field-drain.ts), with the same rule.
describe('EZD-1998 field drain import', () => {
  it('a rejecting loader answers null without rejecting', async () => {
    await expect(loadFieldDrain(() => Promise.reject(new Error('chunk')))).resolves.toBeNull();
  });

  it('a resolving loader answers the module', async () => {
    const m = { startFieldDrain: () => null };
    await expect(
      loadFieldDrain(() =>
        Promise.resolve(m as unknown as typeof import('../../lib/outbox/field-drain')),
      ),
    ).resolves.toBe(m);
  });

  it('office-drain still offers the same field sender', async () => {
    const office = await import('../../lib/outbox/office-drain');
    const field = await import('../../lib/outbox/field-drain');
    expect(office.startFieldDrain).toBe(field.startFieldDrain);
  });
});
