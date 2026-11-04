// EZD-322 U1 (vault/plans/EZD-322.md section 4). Expected values: D1 (the cost-record check runs in
// startSourceFileUpload after the input parse and before the project lookup), D2 (loadPermissionContext on the
// caller's client; null or see_company_costs missing → permission_denied; a thrown load → storage_unavailable),
// the ticket row (routes reuse the helper), AC-3 (other starts make no extra call). The client is a fake
// `{ rpc, from }`; no database.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startSourceFileUpload, StorageError, type StartSourceFileInput } from './index';

type RpcAnswer = { data: unknown; error: { code: string; message: string } | null };

const EDIT_ONLY = {
  membership_id: randomUUID(),
  project_scope: 'all',
  permission_keys: ['edit_model'],
  listed_project_ids: [],
};

function fakeClient(answer: RpcAnswer) {
  const rpc = vi.fn<(fn: string, args?: unknown) => Promise<RpcAnswer>>(async () => answer);
  const from = vi.fn();
  return { client: { rpc, from } as never, rpc, from };
}

const projectId = randomUUID();
const uploadedBy = randomUUID();

function input(overrides: Partial<StartSourceFileInput> = {}): StartSourceFileInput {
  return {
    projectId,
    kind: 'pdf',
    originalName: 'quote.pdf',
    contentType: 'application/pdf',
    size: 100,
    uploadedBy,
    ...overrides,
  };
}

async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('EZD-322 cost-record starts without See company costs (unit)', () => {
  it('EZD-322 U1 (a) supplier_pdf and order_report are refused with one permission read and no table call', async () => {
    for (const kind of ['supplier_pdf', 'order_report'] as const) {
      const fake = fakeClient({ data: [EDIT_ONLY], error: null });
      const err = await rejectionOf(startSourceFileUpload(fake.client, input({ kind })));
      expect(err, kind).toBeInstanceOf(StorageError);
      expect((err as StorageError).code, kind).toBe('permission_denied');
      expect(fake.rpc, kind).toHaveBeenCalledTimes(1);
      expect(fake.rpc.mock.calls[0]?.[0], kind).toBe('current_permissions');
      expect(fake.from, kind).not.toHaveBeenCalled();
    }
  });

  it('EZD-322 U1 (b) a pdf with a supplier name or a supplier contact email is refused the same way', async () => {
    const named = fakeClient({ data: [EDIT_ONLY], error: null });
    const e1 = await rejectionOf(
      startSourceFileUpload(named.client, input({ kind: 'pdf', supplierName: 'Acme Supply' })),
    );
    expect((e1 as StorageError).code).toBe('permission_denied');
    expect(named.from).not.toHaveBeenCalled();

    const mailed = fakeClient({ data: [EDIT_ONLY], error: null });
    const e2 = await rejectionOf(
      startSourceFileUpload(
        mailed.client,
        input({ kind: 'pdf', supplierContactEmail: 'orders@acme.example' }),
      ),
    );
    expect((e2 as StorageError).code).toBe('permission_denied');
    expect(mailed.from).not.toHaveBeenCalled();
  });

  it('EZD-322 U1 (c) no permission row, or a 42501 answer, is refused as permission_denied', async () => {
    const none = fakeClient({ data: [], error: null });
    const e1 = await rejectionOf(
      startSourceFileUpload(none.client, input({ kind: 'supplier_pdf' })),
    );
    expect((e1 as StorageError).code).toBe('permission_denied');
    expect(none.from).not.toHaveBeenCalled();

    const ended = fakeClient({ data: null, error: { code: '42501', message: 'session_ended' } });
    const e2 = await rejectionOf(
      startSourceFileUpload(ended.client, input({ kind: 'supplier_pdf' })),
    );
    expect((e2 as StorageError).code).toBe('permission_denied');
    expect(ended.from).not.toHaveBeenCalled();
  });

  it('EZD-322 U1 (d) any other permission-read error is storage_unavailable with no table call', async () => {
    const broken = fakeClient({ data: null, error: { code: 'XX000', message: 'internal' } });
    const err = await rejectionOf(
      startSourceFileUpload(broken.client, input({ kind: 'supplier_pdf' })),
    );
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).code).toBe('storage_unavailable');
    expect(broken.from).not.toHaveBeenCalled();
  });

  it('EZD-322 U1 (e) other starts make no permission call before the project lookup', async () => {
    const fake = fakeClient({ data: [EDIT_ONLY], error: null });
    fake.from.mockImplementation(() => {
      throw new Error('from-called');
    });
    const err = await rejectionOf(startSourceFileUpload(fake.client, input({ kind: 'pdf' })));
    expect((err as Error).message).toBe('from-called');
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('EZD-322 U1 (f) invalid input is invalid_input before any permission read', async () => {
    const fake = fakeClient({ data: [EDIT_ONLY], error: null });
    const err = await rejectionOf(
      startSourceFileUpload(fake.client, input({ kind: 'supplier_pdf', size: 0 })),
    );
    expect((err as StorageError).code).toBe('invalid_input');
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('EZD-322 U1 (g) only the source_file helper names the source_file table in app code', async () => {
    // The scan reads app/src as text (comments count). Routes reuse the helper, so no other file may write it.
    const root = path.resolve(import.meta.dirname, '../..');
    const matches: string[] = [];
    for (const rel of readdirSync(root, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(rel)) continue;
      if (/\.test\.tsx?$/.test(rel)) continue;
      const parts = rel.split(path.sep);
      if (parts.includes('test-harness')) continue;
      if (rel === path.join('server', 'db', 'database.types.ts')) continue;
      const text = readFileSync(path.join(root, rel), 'utf8');
      if (/['"`]source_file['"`]/.test(text)) matches.push(rel);
    }
    expect(matches).toEqual([path.join('server', 'storage', 'source-files.ts')]);

    const sample = (s: string) => /['"`]source_file['"`]/.test(s);
    expect(sample('.from("source_file")')).toBe(true);
    expect(sample('.from(`source_file`)')).toBe(true);
    expect(sample('.eq("source_file_id", id)')).toBe(false);
  });
});
