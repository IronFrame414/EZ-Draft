// EZD-322 D1 (vault/plans/EZD-322.md section 4) on the local stack. Members sign in with EZD-006's fixtures and
// act through serverDb (gate header sent, as a server route does), so the permission read and the table
// policies apply. Expected values: D1 (the check runs in startSourceFileUpload before any write), D2 (the switch
// is read live from the caller's own permission row), AC-2, AC-3, docs/architecture.md Storage buckets and
// paths (Cost files: A may sign). Cost rows are counted with harnessSql(); objects are removed with the
// secret-key client, rows with cleanup(). The describe's tests run in file order: the Done-when test and D1 (a)
// leave member F with no cost rows; D1 (d) grants F last.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
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
import { SOURCE_FILE_KINDS } from '../../lib/storage/source-file-kinds';
import {
  COST_FILE_KINDS,
  startSourceFileUpload,
  StorageError,
  type DbClient,
  type StartSourceFileInput,
} from './index';

const PDF = 'application/pdf';
const db = (s: Session) => s.serverDb as unknown as DbClient;

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

describe('EZD-322 cost-record starts need See company costs (helper, db)', () => {
  let tenant = '';
  let project = '';
  let a: Member;
  let f: Member;
  let sA: Session;
  let sF: Session;
  const objects: string[] = [];

  const input = (
    who: Member,
    overrides: Partial<StartSourceFileInput> = {},
  ): StartSourceFileInput => ({
    projectId: project,
    kind: 'pdf',
    originalName: 'quote.pdf',
    contentType: PDF,
    size: 100,
    uploadedBy: who.appUserId,
    ...overrides,
  });

  async function start(s: Session, who: Member, overrides: Partial<StartSourceFileInput> = {}) {
    const started = await startSourceFileUpload(db(s), input(who, overrides));
    objects.push(started.sourceFile.storagePath);
    return started;
  }

  // Cost rows written by one member (kind or supplier fields), as the plan's "cost rows of F" count.
  async function costRows(who: Member): Promise<number> {
    const rows = await harnessSql()`
      select count(*)::int as n from public.source_file
      where uploaded_by = ${who.appUserId}::uuid
        and (kind in ('supplier_pdf', 'order_report')
          or supplier_name is not null
          or supplier_contact_email is not null)`;
    return rows[0].n as number;
  }

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    a = await createMember({ tenantId: tenant, scope: 'all' });
    f = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['edit_model', 'see_company_costs']);
    await setPermissions(tenant, f.membershipId, ['edit_model']);
    sA = await signIn(a.email);
    sF = await signIn(f.email);
  });

  afterAll(async () => {
    try {
      if (objects.length) await adminDb().storage.from('sources').remove(objects);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-322 done when: a member without See company costs gets permission_denied for a cost file and writes no row, a member with it succeeds, and other files are unchanged (helper, two members)', async () => {
    for (const kind of ['supplier_pdf', 'order_report'] as const) {
      const err = await caught(startSourceFileUpload(db(sF), input(f, { kind })));
      expect(err, kind).toBeInstanceOf(StorageError);
      expect((err as StorageError).code, kind).toBe('permission_denied');
    }
    expect(await costRows(f)).toBe(0);

    for (const kind of ['supplier_pdf', 'order_report'] as const) {
      const ok = await start(sA, a, { kind });
      expect(ok.sourceFile.kind, kind).toBe(kind);
    }

    const other = await start(sF, f, { kind: 'pdf' });
    expect(other.sourceFile.kind).toBe('pdf');
  });

  it('EZD-322 D1 (a) a member without See company costs is refused for supplier_pdf, order_report and a named pdf, with no row written', async () => {
    const refused: Partial<StartSourceFileInput>[] = [
      { kind: 'supplier_pdf' },
      { kind: 'order_report' },
      { kind: 'pdf', supplierName: 'Acme Supply' },
    ];
    for (const overrides of refused) {
      const err = await caught(startSourceFileUpload(db(sF), input(f, overrides)));
      expect(err, JSON.stringify(overrides)).toBeInstanceOf(StorageError);
      expect((err as StorageError).code, JSON.stringify(overrides)).toBe('permission_denied');
    }
    expect(await costRows(f)).toBe(0);
  });

  it('EZD-322 D1 (b) a member with See company costs starts a supplier file with its name and email, and an order report', async () => {
    const supplier = await start(sA, a, {
      kind: 'supplier_pdf',
      supplierName: 'Acme Supply',
      supplierContactEmail: 'orders@acme.example',
    });
    expect(supplier.sourceFile.kind).toBe('supplier_pdf');
    expect(supplier.upload.token.length).toBeGreaterThan(0);
    const [row] = await harnessSql()`
      select supplier_name from public.source_file where id = ${supplier.sourceFile.id}::uuid`;
    expect(row?.supplier_name).toBe('Acme Supply');

    const order = await start(sA, a, { kind: 'order_report' });
    expect(order.sourceFile.kind).toBe('order_report');
    expect(order.upload.token.length).toBeGreaterThan(0);
  });

  it('EZD-322 D1 (c) the eight other kinds start for a member without See company costs', async () => {
    const others = SOURCE_FILE_KINDS.filter((k) => !COST_FILE_KINDS.includes(k));
    expect(others).toHaveLength(8);
    for (const kind of others) {
      const started = await start(sF, f, { kind });
      expect(started.sourceFile.kind, kind).toBe(kind);
    }
  });

  it('EZD-322 D1 (d) the switch is read live: a member granted See company costs starts a supplier file in the same session', async () => {
    await setPermissions(tenant, f.membershipId, ['edit_model', 'see_company_costs']);
    const started = await start(sF, f, { kind: 'supplier_pdf' });
    expect(started.sourceFile.kind).toBe('supplier_pdf');
  });
});
