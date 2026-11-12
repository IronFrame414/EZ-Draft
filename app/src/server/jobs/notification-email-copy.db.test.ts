// EZD-389 T15 (vault/plans/EZD-389.md section 4; AC-EZD-389-2). Local stack, stub email transport. Holds the
// shared job-queue lock; runJobs passes onlyTenantId (ARCH Background jobs). Expected values: D11, Q-0739 (a).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import type { SendEmailInput } from '../email/types';
import { runJobs } from './runner';

const sends = vi.hoisted(() => [] as SendEmailInput[]);
vi.mock('../email/send', async (orig) => {
  const real = await orig<typeof import('../email/send')>();
  return {
    ...real,
    sendEmail: (
      input: Parameters<typeof real.sendEmail>[0],
      options?: Parameters<typeof real.sendEmail>[1],
    ) => {
      sends.push(input);
      return real.sendEmail(input, options);
    },
  };
});

describe('EZD-389 notification email sends no sender copy', () => {
  let release: () => Promise<void>;
  let tenant = '';
  let project = '';
  let m: Member;

  const createNotification = async (user: string): Promise<string> =>
    (
      await harnessSql()<{ id: string }[]>`
        select private.create_notification(${tenant}::uuid, ${user}::uuid, 'render_finished',
          ${project}::uuid, '{}'::jsonb, '/') as id`
    )[0].id;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    m = await createMember({ tenantId: tenant, scope: 'all' });
  }, 180000);

  afterAll(async () => {
    try {
      if (tenant) await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-389 a notification email sends no sender copy', async () => {
    clearStubOutbox();
    sends.length = 0;
    await createNotification(m.appUserId);
    await runJobs({ onlyTenantId: tenant });
    expect(sends).toHaveLength(1);
    expect(sends[0].sentBy).toBeNull();
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].to).toBe(m.email);
    expect(box[0].subject).toBe('Photoreal render finished');
  });
});
