// EZD-151 · owner alert subject line (vault/plans/EZD-151.md section 4, T10; Scope: Q-0268 regression guard).
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { sendOwnerAlert } from './alert-email';

const FROM = 'EZ Draft Test <test@example.test>';
const ENV_STUB = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: FROM };

describe('EZD-151 alert email subject', () => {
  beforeEach(() => {
    clearStubOutbox();
  });

  it('EZD-151 alert subject with a line break still emails the owner', async () => {
    const rpc = vi.fn();
    const result = await sendOwnerAlert({
      kind: 'error',
      alertId: 'a1',
      claim: 'c1',
      params: {
        kind: 'error',
        title: 'Error: first line\nsecond third',
        source: 'function',
        location: '/api/x',
        eventId: null,
      },
      tenantId: null,
      db: { rpc } as unknown as SupabaseClient<Database>,
      env: { ...ENV_STUB, ALERT_EMAIL_TO: 'owner@example.test' },
    });
    expect(result).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].to).toBe('owner@example.test');
    expect(box[0].subject).toBe('New EZ Draft error: Error: first line second third');
    expect(rpc).not.toHaveBeenCalled();
  });
});

// EZD-135b U7 (vault/plans/EZD-135b.md section 4; Decided "Email link"; Q-0069 (a)): job and webhook alert emails
// open Settings > System status; error alerts keep their link.
describe('EZD-135b alert email link', () => {
  const ENV = { ...ENV_STUB, ALERT_EMAIL_TO: 'owner@example.test' };
  const JOB = {
    kind: 'job_failed' as const,
    jobKind: 'test',
    attempts: 5,
    error: 'ezd135_probe_failed',
    jobId: 'j1',
    projectId: null,
  };
  const send = (
    params: Parameters<typeof sendOwnerAlert>[0]['params'],
    env: Record<string, string>,
  ) =>
    sendOwnerAlert({
      kind: params.kind,
      alertId: 'a1',
      claim: 'c1',
      params,
      tenantId: null,
      db: { rpc: vi.fn() } as unknown as SupabaseClient<Database>,
      env,
    });

  beforeEach(() => {
    clearStubOutbox();
  });

  it('U7 (a) job alert opens System status', async () => {
    expect(await send(JOB, ENV)).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].text.endsWith('http://localhost:3000/settings/system-status\n')).toBe(true);
    expect(box[0].html).toContain(
      '<a href="http://localhost:3000/settings/system-status">Open EZ Draft</a>',
    );
    expect(box[0].html).toContain('<p>http://localhost:3000/settings/system-status</p>');
  });

  it('U7 (b) webhook alert opens System status', async () => {
    const params = {
      kind: 'webhook_failed' as const,
      event: 'project.updated',
      eventId: 'evt-1',
      attempts: 5,
      status: 500,
    };
    expect(await send(params, ENV)).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].text.endsWith('http://localhost:3000/settings/system-status\n')).toBe(true);
    expect(box[0].html).toContain(
      '<a href="http://localhost:3000/settings/system-status">Open EZ Draft</a>',
    );
    expect(box[0].html).toContain('<p>http://localhost:3000/settings/system-status</p>');
  });

  it('U7 (c) preview address', async () => {
    const env = { ...ENV, VERCEL_ENV: 'preview', VERCEL_URL: 'ezdraft-git-t.vercel.app' };
    expect(await send(JOB, env)).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].text.endsWith('https://ezdraft-git-t.vercel.app/settings/system-status\n')).toBe(
      true,
    );
    expect(box[0].html).toContain(
      '<a href="https://ezdraft-git-t.vercel.app/settings/system-status">',
    );
  });

  it('U7 (d) error alert unchanged', async () => {
    const params = {
      kind: 'error' as const,
      title: 'Error: x',
      source: 'function',
      location: '/api/x',
      eventId: null,
    };
    expect(await send(params, ENV)).toBe('emailed');
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].text.endsWith('http://localhost:3000\n')).toBe(true);
    expect(box[0].html).toContain('<a href="http://localhost:3000">Open EZ Draft</a>');
  });
});
