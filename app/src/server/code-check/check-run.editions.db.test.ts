// EZD-643 (AC-EZD-643-1; Q-0220; Q-0765; CLAUDE.md rule 4): a project set to another edition runs that edition's
// rules in Check, and the permit application date picks the edition of an automatic project. Expected values:
// - the catalog (vault/spec/code-rules.json): R3-047 is R303.9 in the 8th Edition (section_now) and R303.1.1 in
//   the 9th (section_next); R3-014 has no 8th Edition section (section_now empty), so it is registered for the 9th
//   only (assumptions EZD-611a);
// - Q-0765: a permit application date on or after 12/31/2026 gives FBC 9th ed. with NEC 2023 and an earlier one
//   FBC 8th ed. with NEC 2020; with no date the creation date decides; an edition picked by hand is kept; changing
//   the date re-picks the edition of an automatic project;
// - assumptions EZD-643: the creation date is read in Florida time (America/New_York, UTC-5 in December).
// The rule sets are fixtures built as a rule ticket builds them (CODE_RULE_SETS is filled by EZD-611b onward).
// Calls go through the gated serverDb of `signIn`, as the routes do.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createRuleRegistry,
  type CodeRule,
  type ModelDocument,
  type ModelObject,
  type RuleSet,
} from '@ezdraft/geometry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { checkProject } from './check-run';

const FBC9 = 'fbc9_nec2023';
const FBC8 = 'fbc8_nec2020';
const LEVEL = '00000000-0000-4000-8000-00000000a643';
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

// A new bath: both rules below apply to it and need a value the drawing does not hold (cannot check).
const bath: ModelObject = {
  id: randomUUID(),
  type: 'room',
  data: {
    geometry: {
      boundary: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 96 },
      ],
    },
    status: 'new',
    level: LEVEL,
    attributes: {
      name: 'Bath 2',
      floorLevel: 0,
      photos: [],
      roomType: 'bath',
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    },
    closureOverride: null,
  },
};
const model: ModelDocument = { objects: [bath] };

const needsData = (id: string, sections: Record<string, string>, need: string): CodeRule => ({
  id,
  code: 'FBC-R',
  type: 'needs_data',
  trigger: 'new_work',
  sections,
  url: 'https://codes.iccsafe.org/content/FLRC2023P1/chapter-3-building-planning',
  appliesTo: ['room'],
  test: () => ({ status: 'missing', need }),
});
const R3_047 = needsData(
  'R3-047',
  { [FBC8]: 'R303.9', [FBC9]: 'R303.1.1' },
  'window faces a porch',
);
const R3_014 = needsData('R3-014', { [FBC9]: 'R302.3.2' }, 'shared accessory room');
const SETS: RuleSet[] = [
  { code: 'FBC-R', edition: FBC9, rules: [R3_014, R3_047] },
  { code: 'FBC-R', edition: FBC8, rules: [R3_047] },
];

type Settings = { status: string; changed: string[] };

describe('EZD-643 other code editions in Check', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // tenant A: create_projects, edit_model, run_code_check, settings_code_edition
  let ownerB: Session; // tenant B: the same

  const create = async (s: Session, name: string, permit?: string) => {
    const r = await db(s).rpc('create_project', {
      p_name: name,
      p_address: '1 Edition St',
      p_type: 'bath',
      p_customer_id: null as unknown as string,
      p_scope_of_work: null as unknown as string,
      ...(permit !== undefined ? { p_permit_application_date: permit } : {}),
    });
    if (r.error) throw new Error(JSON.stringify(r.error));
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const settings = (s: Session, project: string, changes: Record<string, unknown>) =>
    db(s).rpc('update_project_settings', { p_project: project, p_changes: changes as never });
  const setDefault = (s: Session, edition: string) =>
    db(s).rpc('update_tenant_code_edition', {
      p_code_edition: edition,
      p_optional_load_calc: null as unknown as boolean,
    });
  const row = async (project: string) =>
    (
      await harnessSql()`select code_edition, code_edition_auto, permit_application_date::text as permit
        from public.project where id = ${project}::uuid`
    )[0] as { code_edition: string; code_edition_auto: boolean; permit: string | null };
  const check = (project: string) =>
    checkProject(db(owner), { projectId: project, model, registry: createRuleRegistry(SETS) });

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const perms = [
      'view_projects',
      'create_projects',
      'edit_model',
      'run_code_check',
      'settings_code_edition',
    ] as const;
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, perms);
    const m2 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m2.membershipId, perms);
    owner = await signIn(m1.email);
    ownerB = await signIn(m2.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it("AC-EZD-643-1: a project set to another edition runs that edition's rules in Check", async () => {
    const p = await create(owner, 'Eighth Edition bath');
    expect((await row(p)).code_edition).toBe(FBC9);

    const set = await settings(owner, p, { code_edition: FBC8 });
    expect(set.error).toBeNull();
    expect((set.data as Settings).changed).toEqual(['code_edition']);

    const eighth = await check(p);
    expect(eighth?.edition).toBe(FBC8);
    expect(eighth?.results.map((r) => [r.ruleId, r.edition, r.section, r.status])).toEqual([
      ['R3-047', FBC8, 'R303.9', 'cannot_check'],
    ]);
    const [run] =
      await harnessSql()`select edition from public.code_check_run where id = ${eighth!.runId}::uuid`;
    expect(run.edition).toBe(FBC8);

    // Back to the 9th Edition: its rules, with their 9th Edition sections.
    expect((await settings(owner, p, { code_edition: FBC9 })).error).toBeNull();
    const ninth = await check(p);
    expect(ninth?.edition).toBe(FBC9);
    expect(ninth?.results.map((r) => [r.ruleId, r.edition, r.section])).toEqual([
      ['R3-014', FBC9, 'R302.3.2'],
      ['R3-047', FBC9, 'R303.1.1'],
    ]);
  });

  it('Q-0765: under By permit date the permit date picks the edition, and changing it re-picks', async () => {
    expect((await setDefault(owner, 'by_permit_date')).error).toBeNull();
    const before = await create(owner, 'Applied in December', '2026-12-30');
    expect(await row(before)).toEqual({
      code_edition: FBC8,
      code_edition_auto: true,
      permit: '2026-12-30',
    });
    const onDay = await create(owner, 'Applied on the day', '2026-12-31');
    expect(await row(onDay)).toEqual({
      code_edition: FBC9,
      code_edition_auto: true,
      permit: '2026-12-31',
    });
    expect((await check(before))?.edition).toBe(FBC8);

    const moved = await settings(owner, before, { permit_application_date: '2027-01-04' });
    expect(moved.error).toBeNull();
    expect((moved.data as Settings).changed).toEqual(['code_edition', 'permit_application_date']);
    expect(await row(before)).toEqual({
      code_edition: FBC9,
      code_edition_auto: true,
      permit: '2027-01-04',
    });
    const rerun = await check(before);
    expect(rerun?.edition).toBe(FBC9);
    expect(rerun?.results.map((r) => r.ruleId)).toEqual(['R3-014', 'R3-047']);
  });

  it('Q-0765: with no permit date the creation date decides, in Florida time', async () => {
    expect((await setDefault(owner, 'by_permit_date')).error).toBeNull();
    const p = await create(owner, 'No permit date');
    expect((await row(p)).code_edition_auto).toBe(true);
    // 2026-12-31 03:30 UTC is 12/30 in Florida; 05:30 UTC is 12/31.
    await harnessSql()`update public.project set created_at = '2026-12-31T03:30:00Z' where id = ${p}::uuid`;
    expect((await row(p)).code_edition).toBe(FBC8);
    await harnessSql()`update public.project set created_at = '2026-12-31T05:30:00Z' where id = ${p}::uuid`;
    expect((await row(p)).code_edition).toBe(FBC9);
    // A permit date then wins over the creation date; clearing it goes back to the creation date.
    expect((await settings(owner, p, { permit_application_date: '2026-06-01' })).error).toBeNull();
    expect((await row(p)).code_edition).toBe(FBC8);
    expect((await settings(owner, p, { permit_application_date: null })).error).toBeNull();
    expect(await row(p)).toEqual({ code_edition: FBC9, code_edition_auto: true, permit: null });
  });

  it('Q-0765: an edition picked by hand is kept when the date changes; By permit date makes it automatic again', async () => {
    expect((await setDefault(owner, 'by_permit_date')).error).toBeNull();
    const p = await create(owner, 'Picked by hand', '2027-02-01');
    expect((await settings(owner, p, { code_edition: FBC8 })).error).toBeNull();
    expect(await row(p)).toEqual({
      code_edition: FBC8,
      code_edition_auto: false,
      permit: '2027-02-01',
    });

    const moved = await settings(owner, p, { permit_application_date: '2027-03-01' });
    expect((moved.data as Settings).changed).toEqual(['permit_application_date']);
    expect((await row(p)).code_edition).toBe(FBC8);
    expect((await check(p))?.edition).toBe(FBC8);

    const auto = await settings(owner, p, { code_edition: 'by_permit_date' });
    expect((auto.data as Settings).changed).toEqual(['code_edition']);
    expect(await row(p)).toEqual({
      code_edition: FBC9,
      code_edition_auto: true,
      permit: '2027-03-01',
    });
  });

  it('a company default fixed to an edition is stored on new projects, whatever the date', async () => {
    expect((await setDefault(owner, FBC8)).error).toBeNull();
    const p = await create(owner, 'Fixed default', '2027-05-01');
    expect(await row(p)).toEqual({
      code_edition: FBC8,
      code_edition_auto: false,
      permit: '2027-05-01',
    });
    expect((await check(p))?.edition).toBe(FBC8);
  });

  it('refuses a bad permit date or edition (22023), and nothing changes', async () => {
    const p = await create(owner, 'Bad input', '2027-01-15');
    const before = await row(p);
    for (const bad of [
      { permit_application_date: '2026-02-30' },
      { permit_application_date: '12/31/2026' },
      { permit_application_date: 20261231 },
      { code_edition: 'fbc7_nec2017' },
    ]) {
      expect((await settings(owner, p, bad)).error?.code, JSON.stringify(bad)).toBe('22023');
    }
    expect((await setDefault(owner, 'fbc7_nec2017')).error?.code).toBe('22023');
    expect(await row(p)).toEqual(before);
  });

  it("one company cannot change another company's permit date or edition, nor check its project", async () => {
    const p = await create(owner, 'Company A dated', '2026-12-01');
    const before = await row(p);
    expect(
      (await settings(ownerB, p, { permit_application_date: '2027-01-04' })).error,
    ).not.toBeNull();
    expect((await settings(ownerB, p, { code_edition: FBC9 })).error).not.toBeNull();
    expect(await row(p)).toEqual(before);
    const read = await db(ownerB)
      .from('project')
      .select('permit_application_date, code_edition')
      .eq('id', p);
    expect(read.data ?? []).toEqual([]);
    expect(
      await checkProject(db(ownerB), { projectId: p, model, registry: createRuleRegistry(SETS) }),
    ).toBeNull();
    // Company B's default does not reach company A's projects.
    expect((await setDefault(ownerB, FBC8)).error).toBeNull();
    expect(await row(p)).toEqual(before);
  });
});
