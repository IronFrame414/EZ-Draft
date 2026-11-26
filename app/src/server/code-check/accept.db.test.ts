// EZD-612 (AC-EZD-612-3 "accepting a warning with a note removes it from the open count and stores the note";
// CLAUDE.md rule 4; 20261125200000_code_check_accept.sql; assumptions EZD-612 "Accepted warnings on the next run"):
// accept_code_warning and carry_code_check_acceptances. Expected values: the migration header (Edit model and sight
// of the project, else 42501; a run that is not the latest, 40001; an empty note or a result that is not a failing
// warning, 22023) and the phase-06 EZD-612 row (Edit model, no lock). Calls go through the gated serverDb of `signIn`.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckResult } from '@ezdraft/geometry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import {
  acceptCodeWarning,
  carryAcceptances,
  latestCodeCheckRun,
  openWarningCount,
  recordCodeCheckRun,
} from './check-run';

const FBC9 = 'fbc9_nec2023';
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

const result = (
  ruleId: string,
  objectId: string,
  over: Partial<CheckResult> = {},
): CheckResult => ({
  ruleId,
  code: 'company',
  edition: FBC9,
  section: null,
  url: null,
  type: 'automatic',
  status: 'fail',
  severity: 'warning',
  objectId,
  objectType: 'device',
  unverified: true,
  ...over,
});

describe('EZD-612 accept a code warning with a note', () => {
  let tenantA = '';
  let tenantB = '';
  let projectA = '';
  let projectA2 = '';
  let editor: Session; // tenant A, all projects, run_code_check + edit_model
  let checkerOnly: Session; // tenant A, run_code_check, no edit_model
  let listed: Session; // tenant A, edit_model, sees projectA2 only
  let editorB: Session; // tenant B, run_code_check + edit_model
  const FAN = randomUUID();
  const TOILET = randomUUID();
  const NOTE = 'Owner chose this fan; inspector agreed on site.';

  const results = () => [
    result('FC-001', FAN),
    result('BC-001', TOILET, { objectType: 'fixture' }),
    result('HC-001', FAN, { status: 'cannot_check' }),
  ];
  let floor = '';
  const storeObject = async (id: string, seq: number) => {
    if (floor === '') {
      const f = await adminDb()
        .from('model_object')
        .select('object_id')
        .eq('project_id', projectA)
        .eq('type', 'floor')
        .limit(1)
        .single();
      if (f.error) throw new Error(JSON.stringify(f.error));
      floor = (f.data as { object_id: string }).object_id;
    }
    const { error } = await adminDb()
      .from('model_object')
      .upsert({
        project_id: projectA,
        object_id: id,
        tenant_id: tenantA,
        type: 'device',
        data: { level: floor },
        schema_version: 1,
        updated_seq: seq,
      });
    if (error) throw new Error(JSON.stringify(error));
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [projectA, projectA2] = await createProjects(tenantA, 2);
    await createProjects(tenantB, 1);
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, [
      'view_projects',
      'run_code_check',
      'edit_model',
    ]);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'run_code_check']);
    const m3 = await createMember({ tenantId: tenantA, scope: 'listed', listed: [projectA2] });
    await setPermissions(tenantA, m3.membershipId, [
      'view_projects',
      'run_code_check',
      'edit_model',
    ]);
    const m4 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m4.membershipId, [
      'view_projects',
      'run_code_check',
      'edit_model',
    ]);
    editor = await signIn(m1.email);
    checkerOnly = await signIn(m2.email);
    listed = await signIn(m3.email);
    editorB = await signIn(m4.email);
    await storeObject(FAN, 3);
    await storeObject(TOILET, 1);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-612-3 the note is stored and the warning leaves the open count', async () => {
    const runId = await recordCodeCheckRun(db(editor), {
      projectId: projectA,
      modelVersionId: null,
      edition: FBC9,
      results: results(),
    });
    const before = await latestCodeCheckRun(db(editor), projectA);
    expect(before?.runId).toBe(runId);
    // Two failing warnings; the cannot-check result is not a warning.
    expect(openWarningCount(before!.results, before!.accepted)).toBe(2);

    const out = await acceptCodeWarning(db(editor), {
      runId,
      ruleId: 'FC-001',
      objectId: FAN,
      note: `  ${NOTE} `,
    });
    expect(out).toEqual({
      ok: true,
      entry: expect.objectContaining({
        ruleId: 'FC-001',
        objectId: FAN,
        edition: FBC9,
        note: NOTE,
        objectSeq: 3,
      }),
    });
    const after = await latestCodeCheckRun(db(editor), projectA);
    expect(after?.accepted).toEqual([
      expect.objectContaining({ ruleId: 'FC-001', objectId: FAN, note: NOTE }),
    ]);
    expect(after?.accepted[0]?.by).toEqual(expect.any(String));
    expect(openWarningCount(after!.results, after!.accepted)).toBe(1);
  });

  it('refuses without Edit model, out of scope, and from another company; the row is unchanged', async () => {
    const run = await latestCodeCheckRun(db(editor), projectA);
    const input = { runId: run!.runId, ruleId: 'BC-001', objectId: TOILET, note: 'x' };
    expect(await acceptCodeWarning(db(checkerOnly), input)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await acceptCodeWarning(db(listed), input)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await acceptCodeWarning(db(editorB), input)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    // Company B cannot read A's run either.
    const seen = await db(editorB).from('code_check_run').select('id').eq('id', run!.runId);
    expect(seen.data ?? []).toEqual([]);
    const carry = await db(editorB).rpc('carry_code_check_acceptances', { p_run: run!.runId });
    expect(carry.error?.code).toBe('42501');
    // A direct update is not allowed (select policy only).
    const upd = await db(editor)
      .from('code_check_run')
      .update({ accepted_notes: [] })
      .eq('id', run!.runId)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
    const again = await latestCodeCheckRun(db(editor), projectA);
    expect(again?.accepted.map((a) => a.ruleId)).toEqual(['FC-001']);
  });

  it('an empty note, a result that is not a failing warning and an unknown rule are invalid', async () => {
    const run = await latestCodeCheckRun(db(editor), projectA);
    const base = { runId: run!.runId, objectId: FAN };
    expect(await acceptCodeWarning(db(editor), { ...base, ruleId: 'BC-001', note: '   ' })).toEqual(
      {
        ok: false,
        code: 'invalid_input',
      },
    );
    expect(await acceptCodeWarning(db(editor), { ...base, ruleId: 'HC-001', note: 'n' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(await acceptCodeWarning(db(editor), { ...base, ruleId: 'ZZ-999', note: 'n' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });

  it('the next run keeps an acceptance while its object is unchanged; an edited object lifts it', async () => {
    const first = await latestCodeCheckRun(db(editor), projectA);
    const second = await recordCodeCheckRun(db(editor), {
      projectId: projectA,
      modelVersionId: null,
      edition: FBC9,
      results: results(),
    });
    // Accepting on a run that is no longer the latest is refused.
    expect(
      await acceptCodeWarning(db(editor), {
        runId: first!.runId,
        ruleId: 'BC-001',
        objectId: TOILET,
        note: 'n',
      }),
    ).toEqual({ ok: false, code: 'run_not_latest' });
    // Only the person who recorded the run carries onto it.
    const other = await db(checkerOnly).rpc('carry_code_check_acceptances', { p_run: second });
    expect(other.error?.code).toBe('42501');
    expect(await carryAcceptances(db(editor), second)).toBe(1);
    const kept = await latestCodeCheckRun(db(editor), projectA);
    expect(kept?.accepted).toEqual([
      expect.objectContaining({ ruleId: 'FC-001', objectId: FAN, note: NOTE }),
    ]);
    expect(kept?.accepted[0]?.at).toBe(first!.accepted[0]?.at);
    expect(openWarningCount(kept!.results, kept!.accepted)).toBe(1);

    await storeObject(FAN, 4);
    const third = await recordCodeCheckRun(db(editor), {
      projectId: projectA,
      modelVersionId: null,
      edition: FBC9,
      results: results(),
    });
    expect(await carryAcceptances(db(editor), third)).toBe(0);
    const lifted = await latestCodeCheckRun(db(editor), projectA);
    expect(lifted?.accepted).toEqual([]);
    expect(openWarningCount(lifted!.results, lifted!.accepted)).toBe(2);
  });
});
