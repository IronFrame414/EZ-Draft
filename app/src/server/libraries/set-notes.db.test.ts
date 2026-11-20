// EZD-714 (S15h Notes; S15c Required notes; AC-EZD-714-1; CLAUDE.md rule 4). Expected values: the AC (a profile's
// required notes are returned by the set's notes query for a project using that profile); the seven GENERAL NOTES
// of the S13 board, in board order, as every company's starting notes for every project type (assumptions
// EZD-714); the migration header (20261119160000_notes_library.sql): required notes are the company's own notes
// (23514, invalid_input through update_submittal_profile), a deleted note leaves the profiles, a note may run to
// 1000 characters while other kinds keep 120.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { getSetNotes } from './set-notes';

const BOARD_NOTES = [
  'Verify all dimensions in field before ordering cabinets.',
  'All work to comply with the Florida Building Code in effect at time of permit, and local amendments.',
  'Dimensions are to face of finished wall or face of cabinet box unless noted otherwise.',
  'Cabinet codes per cabinet schedule. See A4.0.',
  'Details per A5.0. Reflected ceiling per A6.0.',
  'Electrical, lighting and load calc per E1.0 and E2.0.',
  'Protect existing finishes to remain. Contractor to patch and match at all disturbed surfaces.',
];

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

describe('EZD-714 notes library and the set notes query', () => {
  let tenantA = '';
  let tenantB = '';
  let viewerA: Session; // view_projects
  let presetsA: Session; // settings_sheet_presets
  let viewerB: Session;

  const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
  const addNote = async (
    tenant: string,
    text: string,
    group: 'general' | 'code',
    projectTypes: string[],
  ) =>
    (
      await harnessSql()`insert into public.library_item (tenant_id, kind, name, data)
        values (${tenant}::uuid, 'note', ${text},
          ${JSON.stringify({ group, projectTypes })}::text::jsonb) returning id`
    )[0].id as string;
  const addProfile = async (tenant: string, department: string, notes: string[] = []) =>
    (
      await harnessSql()`insert into public.submittal_profile (tenant_id, department, required_notes)
        values (${tenant}::uuid, ${department}, ${notes}::uuid[]) returning id`
    )[0].id as string;
  const useProfile = (project: string, profile: string) =>
    harnessSql()`update public.project set submittal_profile_id = ${profile}::uuid where id = ${project}::uuid`;
  const requiredOf = async (profile: string) =>
    (
      await harnessSql()`select required_notes from public.submittal_profile where id = ${profile}::uuid`
    )[0].required_notes as string[];

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['settings_sheet_presets']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['view_projects']);
    viewerA = await signIn(m1.email);
    presetsA = await signIn(m2.email);
    viewerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('every company starts with the seven board general notes, in board order, for every project type, once', async () => {
    await harnessSql()`select private.seed_general_notes(${tenantA}::uuid)`;
    await harnessSql()`select private.seed_general_notes(${tenantA}::uuid)`;
    const rows = await harnessSql()`select name, data from public.library_item
      where tenant_id = ${tenantA}::uuid and kind = 'note' order by created_at, id`;
    expect(rows.map((r) => r.name)).toEqual(BOARD_NOTES);
    for (const r of rows) {
      expect(r.data).toEqual({
        group: 'general',
        projectTypes: ['kitchen', 'bath', 'whole_home_interior'],
      });
    }
  });

  it("AC-EZD-714-1: a profile's required notes are returned by the set's notes query for a project using that profile", async () => {
    const egress = await addNote(tenantA, 'Provide egress per FBC R310.', 'code', ['bath']);
    const smoke = await addNote(tenantA, 'Smoke alarms per FBC R314.', 'code', ['kitchen']);
    const bathOnly = await addNote(tenantA, 'Bath only general note.', 'general', ['bath']);
    // Profile order is print order: smoke first.
    const pbc = await addProfile(tenantA, `PBC ${egress.slice(0, 6)}`, [smoke, egress]);
    const boca = await addProfile(tenantA, `Boca ${egress.slice(0, 6)}`);
    const [onPbc, onBoca] = await createProjects(tenantA, 2);
    await useProfile(onPbc, pbc);
    await useProfile(onBoca, boca);

    const a = await getSetNotes(db(viewerA), onPbc);
    expect(a).not.toBeNull();
    expect(a!.required).toEqual([
      { id: smoke, text: 'Smoke alarms per FBC R314.', group: 'code' },
      { id: egress, text: 'Provide egress per FBC R310.', group: 'code' },
    ]);
    // A kitchen project: the seven general notes; the bath-only note and unrequired code notes do not print.
    expect(a!.general.map((n) => n.text)).toEqual(BOARD_NOTES);
    expect(a!.general.some((n) => n.id === bathOnly)).toBe(false);

    const b = await getSetNotes(db(viewerA), onBoca);
    expect(b!.required).toEqual([]);
    expect(b!.general.map((n) => n.text)).toEqual(BOARD_NOTES);

    // A bath project gets the bath general note after the seven.
    await harnessSql()`update public.project set type = 'bath' where id = ${onBoca}::uuid`;
    const bath = await getSetNotes(db(viewerA), onBoca);
    expect(bath!.general.map((n) => n.id).at(-1)).toBe(bathOnly);
    expect(bath!.general).toHaveLength(8);

    // A required general note is listed once, under required.
    const first = b!.general[0];
    await harnessSql()`update public.submittal_profile set required_notes = ${[first.id]}::uuid[] where id = ${boca}::uuid`;
    const once = await getSetNotes(db(viewerA), onBoca);
    expect(once!.required.map((n) => n.id)).toEqual([first.id]);
    expect(once!.general.some((n) => n.id === first.id)).toBe(false);

    // Another company sees neither the project nor its notes.
    expect(await getSetNotes(db(viewerB), onPbc)).toBeNull();
  });

  it("required notes are only the company's own notes, each once; update_submittal_profile answers invalid_input", async () => {
    const mine = await addNote(tenantA, 'Company A note.', 'general', ['kitchen']);
    const theirs = await addNote(tenantB, 'Company B note.', 'general', ['kitchen']);
    const abbreviation = (
      await harnessSql()`insert into public.library_item (tenant_id, kind, name, data)
        values (${tenantA}::uuid, 'abbreviation', ${`ZZ${mine.slice(0, 4)}`}, '{"meaning":"x"}'::jsonb) returning id`
    )[0].id as string;
    const profile = await addProfile(tenantA, `Checks ${mine.slice(0, 6)}`);

    for (const bad of [[theirs], [abbreviation], [mine, mine]]) {
      expect(
        await codeOf(
          harnessSql()`update public.submittal_profile set required_notes = ${bad}::uuid[] where id = ${profile}::uuid`,
        ),
        bad.join(','),
      ).toBe('23514');
      const r = await presetsA.serverDb.rpc('update_submittal_profile', {
        p_id: profile,
        p_changes: { required_notes: bad },
      });
      expect(r.error?.code).toBe('22023');
    }

    const ok = await presetsA.serverDb.rpc('update_submittal_profile', {
      p_id: profile,
      p_changes: { required_notes: [mine] },
    });
    expect(ok.error).toBeNull();
    expect((ok.data as { changed: string[] }).changed).toContain('required_notes');
    expect(await requiredOf(profile)).toEqual([mine]);
  });

  it('a deleted note leaves every profile that required it', async () => {
    const keep = await addNote(tenantA, 'Keep me.', 'code', ['kitchen']);
    const gone = await addNote(tenantA, 'Delete me.', 'code', ['kitchen']);
    const p1 = await addProfile(tenantA, `Del one ${gone.slice(0, 6)}`, [gone, keep]);
    const p2 = await addProfile(tenantA, `Del two ${gone.slice(0, 6)}`, [gone]);
    await harnessSql()`delete from public.library_item where id = ${gone}::uuid`;
    expect(await requiredOf(p1)).toEqual([keep]);
    expect(await requiredOf(p2)).toEqual([]);
  });

  it('a note may be up to 1000 characters; other kinds keep the 120-character name', async () => {
    expect(await codeOf(addNote(tenantA, 'n'.repeat(1000), 'general', ['kitchen']))).toBeNull();
    expect(await codeOf(addNote(tenantA, 'n'.repeat(1001), 'general', ['kitchen']))).toBe('23514');
    expect(
      await codeOf(
        harnessSql()`insert into public.library_item (tenant_id, kind, name)
          values (${tenantA}::uuid, 'part', ${'p'.repeat(121)})`,
      ),
    ).toBe('23514');
  });
});
