// EZD-135 U3 (vault/plans/EZD-135.md section 4; AC-EZD-135-2, AC-EZD-135-4). Fake clients; no database.
// Expected values: Decided "Backups", "Job failures query", "Webhook failures query", "Range past the last row",
// "List errors", "Row schemas"; Q-0664; Q-0672 (b).
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/database.types';
import { loadBackupStatus, loadJobFailures, loadWebhookFailures } from './system-status';

type Err = { code: string; message: string };

function rpcFake(data: unknown, error: Err | null = null) {
  const rpc = vi.fn(async (..._args: unknown[]) => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

type Res = { data: unknown; error: Err | null; count: number | null };

function listFake(results: Res[]) {
  const calls: Array<[string, unknown[]]> = [];
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'range']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.then = (res: (v: Res | undefined) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(queue.shift()).then(res, rej);
  const client = {
    from: (t: string) => {
      calls.push(['from', [t]]);
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const T = '2999-01-02T00:00:00+00:00';
const FILES = {
  kind: 'files',
  status: 'succeeded',
  finished_at: T,
  bytes_copied: 7340032,
  location: null,
};
const DUMP = {
  kind: 'db_dump',
  status: 'succeeded',
  finished_at: T,
  bytes_copied: 123456789,
  location: 'db/29990102T080000Z',
};
const RANGE = { code: 'PGRST103', message: 'Requested range not satisfiable' };

describe('EZD-135 system status loaders', () => {
  it('U3 (a) files and dump rows', async () => {
    const { client, rpc } = rpcFake([DUMP, FILES]);
    expect(await loadBackupStatus(client)).toStrictEqual({
      ok: true,
      status: {
        files: { finishedAt: T, bytesCopied: 7340032, location: null },
        dbDump: { finishedAt: T, bytesCopied: 123456789, location: 'db/29990102T080000Z' },
        restoreDrill: null,
      },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(['system_backup_status']);
  });

  it('U3 (b) a failed drill and no rows', async () => {
    const drill = {
      kind: 'restore_drill',
      status: 'failed',
      finished_at: '2999-01-06T00:00:00+00:00',
      bytes_copied: 0,
      location: null,
    };
    expect(await loadBackupStatus(rpcFake([drill]).client)).toStrictEqual({
      ok: true,
      status: {
        files: null,
        dbDump: null,
        restoreDrill: {
          finishedAt: '2999-01-06T00:00:00+00:00',
          bytesCopied: 0,
          location: null,
          status: 'failed',
        },
      },
    });
    expect(await loadBackupStatus(rpcFake([]).client)).toStrictEqual({
      ok: true,
      status: { files: null, dbDump: null, restoreDrill: null },
    });
  });

  it('U3 (c) permission_denied is refused, other errors throw', async () => {
    expect(
      await loadBackupStatus(rpcFake(null, { code: '42501', message: 'permission_denied' }).client),
    ).toStrictEqual({ ok: false, code: 'permission_denied' });
    for (const err of [
      { code: '42501', message: 'api_gate' },
      { code: 'XX000', message: 'boom' },
    ]) {
      await expect(loadBackupStatus(rpcFake(null, err).client)).rejects.toBe(err);
    }
  });

  it('U3 (d) a bad reply throws', async () => {
    const bad: unknown[] = [
      [{ ...FILES, bytes_copied: -1 }],
      [FILES, FILES],
      [{ ...FILES, status: 'running', bytes_copied: 0 }],
      [{ ...FILES, error: 'x' }],
      null,
    ];
    for (const data of bad) {
      await expect(loadBackupStatus(rpcFake(data).client)).rejects.toThrow(
        'system_backup_status_bad_reply',
      );
    }
  });

  it('U3 (e) list queries and the past-the-end count', async () => {
    const JOB_SINCE = '2026-10-12T12:00:00.000Z';
    const a = listFake([
      { data: null, error: RANGE, count: null },
      { data: null, error: null, count: 52 },
    ]);
    expect(await loadJobFailures(a.client, 3, new Date('2026-11-11T12:00:00Z'))).toEqual({
      rows: [],
      total: 52,
      page: 3,
      pageSize: 50,
    });
    expect(a.calls).toEqual([
      ['from', ['job']],
      ['select', ['id, kind, error, attempts, finished_at', { count: 'exact' }]],
      ['eq', ['status', 'failed']],
      ['gte', ['finished_at', JOB_SINCE]],
      ['order', ['finished_at', { ascending: false }]],
      ['order', ['id', { ascending: false }]],
      ['range', [100, 149]],
      ['from', ['job']],
      ['select', ['id', { count: 'exact', head: true }]],
      ['eq', ['status', 'failed']],
      ['gte', ['finished_at', JOB_SINCE]],
    ]);

    const b = listFake([
      {
        data: [
          {
            id: 'w1',
            title: 'project.updated: 500',
            ref: 'evt-1',
            occurrences: 3,
            last_seen_at: '2026-11-09T15:04:00+00:00',
          },
        ],
        error: null,
        count: 1,
      },
    ]);
    expect(await loadWebhookFailures(b.client, 1)).toEqual({
      rows: [
        {
          id: 'w1',
          title: 'project.updated: 500',
          ref: 'evt-1',
          occurrences: 3,
          lastSeenAt: '2026-11-09T15:04:00+00:00',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    expect(b.calls).toEqual([
      ['from', ['error_alert']],
      ['select', ['id, title, ref, occurrences, last_seen_at', { count: 'exact' }]],
      ['eq', ['kind', 'webhook_failed']],
      ['order', ['last_seen_at', { ascending: false }]],
      ['order', ['id', { ascending: false }]],
      ['range', [0, 49]],
    ]);

    const c = listFake([
      { data: null, error: RANGE, count: null },
      { data: null, error: null, count: 2 },
    ]);
    expect(await loadWebhookFailures(c.client, 2)).toEqual({
      rows: [],
      total: 2,
      page: 2,
      pageSize: 50,
    });
    expect(c.calls).toEqual([
      ['from', ['error_alert']],
      ['select', ['id, title, ref, occurrences, last_seen_at', { count: 'exact' }]],
      ['eq', ['kind', 'webhook_failed']],
      ['order', ['last_seen_at', { ascending: false }]],
      ['order', ['id', { ascending: false }]],
      ['range', [50, 99]],
      ['from', ['error_alert']],
      ['select', ['id', { count: 'exact', head: true }]],
      ['eq', ['kind', 'webhook_failed']],
    ]);
  });

  it('U3 (f) list errors throw', async () => {
    const xx = { code: 'XX000', message: 'x' };
    await expect(
      loadJobFailures(listFake([{ data: null, error: xx, count: null }]).client, 1),
    ).rejects.toBe(xx);
    await expect(
      loadWebhookFailures(listFake([{ data: [], error: null, count: null }]).client, 1),
    ).rejects.toThrow('system_status_count_failed');
    await expect(
      loadJobFailures(
        listFake([
          { data: null, error: { code: 'PGRST103', message: 'r' }, count: null },
          { data: null, error: { code: 'XX000', message: 'h' }, count: null },
        ]).client,
        1,
      ),
    ).rejects.toThrow('system_status_count_failed');
    await expect(
      loadJobFailures(
        listFake([
          {
            data: [
              {
                id: 'j1',
                kind: 'test',
                error: null,
                attempts: '5',
                finished_at: '2026-11-09T15:04:00+00:00',
              },
            ],
            error: null,
            count: 1,
          },
        ]).client,
        1,
      ),
    ).rejects.toThrow('system_status_bad_reply');
  });
});
