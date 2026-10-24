// EZD-021 T1, T2, T17, T18 (vault/plans/EZD-021.md section 4), local stack. Every runJobs call passes
// onlyTenantId = this file's fresh tenant (EZD-009 Step 8). Holds the shared job-queue lock from the start of
// beforeAll to the end of afterAll, after deleting its jobs. Sessions come from signIn().serverDb (EZD-006).
// Expected values: the ticket's Done when, the Step 3 recording, the Step 5 test.echo purpose, Step 1 model
// ids and the EZD-009 retry rules (Q-0059 (a)).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAiTestContext } from '../../../test-harness/ai/context';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { blockedAttempts } from '../../../test-harness/net-guard/net-guard.mjs';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { AiError } from '../ai/errors';
import { callClaude } from '../ai';
import type { ClaudeRequest } from '../ai/types';
import { clearStubRecordings, lastStubRequests, setStubRecording } from '../ai/test-harness/stub';
import { getAiPurposes } from './ai-purposes';
import { createJobsDbClient } from './db';
import { enqueueJob } from './enqueue';
import { JobError } from './errors';
import { getHandlers } from './handlers';
import { createJobQueue } from './queue';
import { runJobs } from './runner';

type Row = Record<string, unknown>;

const ECHO_RESULT = {
  purpose: 'test.echo',
  output: {
    text: 'EZD-021 stub response',
    modelId: 'claude-haiku-5-5',
    mode: 'stub',
    usage: { inputTokens: 12, outputTokens: 6 },
  },
};

describe('EZD-021 ai_read job on the local stack', () => {
  let tenantA = '';
  let p1 = '';
  let o: Member;
  let oSession: Session;
  let queue: ReturnType<typeof createJobQueue>;
  let release: () => Promise<void>;
  let guardBefore = 0;

  const deleteJobs = async () => {
    if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
  };

  async function jobRow(id: string): Promise<Row> {
    const { data, error } = await adminDb().from('job').select('*').eq('id', id).single();
    expect(error).toBeNull();
    return data as Row;
  }

  async function jobCount(): Promise<number> {
    const { count, error } = await adminDb()
      .from('job')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA);
    expect(error).toBeNull();
    return count ?? 0;
  }

  const echoPayload = (prompt: string) => ({ purpose: 'test.echo', input: { prompt } });

  beforeAll(async () => {
    release = await holdJobQueueShared();
    queue = createJobQueue(createJobsDbClient());
    tenantA = await createTenant();
    [p1] = await createProjects(tenantA, 1);
    o = await createMember({ tenantId: tenantA, scope: 'all' });
    oSession = await signIn(o.email);
  }, 180000);

  beforeEach(() => {
    clearStubRecordings();
    guardBefore = blockedAttempts().length;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await deleteJobs();
  });

  afterAll(async () => {
    await deleteJobs();
    await cleanup();
    await closeHarness();
    await release?.();
  });

  // T1
  it('EZD-021 done when: a queued test job returns the stub response @smoke', async () => {
    const kick = vi.fn();
    const { id } = await enqueueJob(
      oSession.serverDb,
      { kind: 'ai_read', projectId: p1, payload: echoPayload('EZD-021 done when') },
      { kick },
    );
    expect(kick).toHaveBeenCalledTimes(1);
    await runJobs({ queue, onlyTenantId: tenantA });

    const row = await jobRow(id);
    expect(row.status).toBe('done');
    expect(row.attempts).toBe(1);
    expect(row.error).toBeNull();
    expect(row.result).toEqual(ECHO_RESULT);

    const requests = lastStubRequests('anthropic');
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(requests[0].headers['x-api-key']).toBe('stub-key');
    const body = JSON.parse(requests[0].bodyText ?? '{}');
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.max_tokens).toBe(64);
    expect(JSON.stringify(body.messages[0].content)).toContain('EZD-021 done when');
    expect(blockedAttempts().length).toBe(guardBefore);
  });

  // T2
  it('EZD-021 done when: with no key set a live job fails with "AI key not set"', async () => {
    vi.stubEnv('AI_MODE', 'live');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { id } = await enqueueJob(
      oSession.serverDb,
      { kind: 'ai_read', projectId: p1, payload: echoPayload('EZD-021 no key') },
      { kick: () => {} },
    );
    const onJobFailed = vi.fn();
    await runJobs({ queue, onlyTenantId: tenantA, onJobFailed });

    const row = await jobRow(id);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('ai_key_not_set');
    expect(row.attempts).toBe(1);
    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(lastStubRequests('anthropic')).toHaveLength(0);

    const request: ClaudeRequest = {
      purpose: 'test.echo',
      model: 'haiku',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'EZD-021 no key' }] }],
      maxTokens: 64,
    };
    for (const key of [undefined, '   ']) {
      vi.stubEnv('ANTHROPIC_API_KEY', key);
      const error = await callClaude(makeAiTestContext(), request).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe('ai_key_not_set');
      expect((error as AiError).retry).toBe(false);
      expect((error as AiError).message).toBe('AI key not set');
    }
    expect(lastStubRequests('anthropic')).toHaveLength(0);
    expect(blockedAttempts().length).toBe(guardBefore);
  });

  // T17
  it('EZD-021 T17 the ai_read handler is safe to run twice', async () => {
    const payload = echoPayload('x');
    await expectSafeToRunTwice('ai_read', { payload });

    const handler = getHandlers().ai_read;
    expect(handler).toBeDefined();
    const ctx = {
      job: {
        id: '00000000-0000-4000-8000-00000000a017',
        tenant_id: tenantA,
        project_id: p1,
        kind: 'ai_read',
        attempts: 1,
      },
      payload: handler!.payload.parse(payload),
      state: null,
      progress: async () => {},
      timeLeft: () => Number.MAX_SAFE_INTEGER,
      sleep: async () => {},
      signal: new AbortController().signal,
    };
    expect(await handler!.run(ctx as never)).toEqual({ done: ECHO_RESULT });
    expect(await handler!.run(ctx as never)).toEqual({ done: ECHO_RESULT });
  });

  // T18
  it('EZD-021 T18 the ai_read handler checks its payload and retries only what a retry can fix', async () => {
    const kick = vi.fn();
    // (a) unknown purpose and (b) a 201-character prompt: refused before any row
    const unknown = await enqueueJob(
      oSession.serverDb,
      { kind: 'ai_read', projectId: p1, payload: { purpose: 'x.unknown', input: { prompt: 'x' } } },
      { kick },
    ).catch((e: unknown) => e);
    expect(unknown).toBeInstanceOf(JobError);
    expect(unknown).toMatchObject({ code: 'invalid_payload' });
    const long = await enqueueJob(
      oSession.serverDb,
      { kind: 'ai_read', projectId: p1, payload: echoPayload('x'.repeat(201)) },
      { kick },
    ).catch((e: unknown) => e);
    expect(long).toBeInstanceOf(JobError);
    expect(long).toMatchObject({ code: 'invalid_payload' });
    expect(await jobCount()).toBe(0);
    expect(kick).toHaveBeenCalledTimes(0);

    // (c) an admin-inserted row with an unknown purpose: the runner marks it invalid_payload
    const { data: inserted, error: insertError } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantA,
        project_id: p1,
        kind: 'ai_read',
        payload: { purpose: 'x.unknown', input: { prompt: 'x' } },
        max_attempts: 3,
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    await runJobs({ queue, onlyTenantId: tenantA });
    const bad = await jobRow((inserted as { id: string }).id);
    expect(bad.status).toBe('failed');
    expect(bad.error).toBe('invalid_payload');
    expect(bad.attempts).toBe(1);

    // (d) a rate limit is retried: queued again with the code, a later run_after
    setStubRecording('anthropic', 'test.echo', {
      provider: 'anthropic',
      purpose: 'test.echo',
      source: 'synthetic',
      exchanges: [
        {
          match: { method: 'POST', url: 'https://api.anthropic.com/v1/messages' },
          response: {
            status: 429,
            json: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
          },
        },
      ],
    });
    const { id } = await enqueueJob(
      oSession.serverDb,
      { kind: 'ai_read', projectId: p1, payload: echoPayload('EZD-021 retry') },
      { kick: () => {} },
    );
    const { error: updateError } = await adminDb()
      .from('job')
      .update({ max_attempts: 3 })
      .eq('id', id);
    expect(updateError).toBeNull();
    await runJobs({ queue, onlyTenantId: tenantA });
    const retried = await jobRow(id);
    expect(retried.status).toBe('queued');
    expect(retried.error).toBe('ai_rate_limited');
    expect(retried.attempts).toBe(1);
    expect(Date.parse(retried.run_after as string)).toBeGreaterThan(
      Date.parse(retried.updated_at as string),
    );

    // (e) production registers no test purpose and no test job
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(Object.keys(getAiPurposes()).filter((key) => key.startsWith('test.'))).toEqual([]);
    expect(Object.keys(getHandlers())).toContain('ai_read');
    expect(Object.keys(getHandlers())).not.toContain('test');
  });
});
