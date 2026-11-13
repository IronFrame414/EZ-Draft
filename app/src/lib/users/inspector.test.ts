// EZD-106 inspector helpers (AC-EZD-106-3, -4). Expected values: 09n "Switch counts" rows 1-5 (Owner 37 / 37,
// Crew 4 / 37, Foreman with See company costs 12 / 37 "(modified)", Designer admin group 2 of 10, Foreman with
// one switch unticked then Reset back to 11 / 37); Q-0695 decisions 10 row 58 (presets 37, 26, 11, 4); the
// catalog.ts group sizes (projects 7, renders 5, money 5, issue_send 4, field 6, admin 10); Q-0725 (a) (the
// footer n: each differing switch, plus 1 for role, plus 1 for language). Preset arrays come from
// app/test-harness/users/fixtures.ts (copied from migration 20261024100001).
import { describe, expect, it } from 'vitest';
import { PRESET_KEYS } from '../../../test-harness/users/fixtures';
import type { PermissionKey } from '../permissions/catalog';
import {
  chooseRole,
  draftModified,
  draftOf,
  groupCounts,
  pendingEdits,
  resetToRole,
  toggleSwitch,
  type InspectorDraft,
} from './inspector';
import type { UserRole, UserRow } from './users';

const role = (
  id: string,
  name: string,
  preset: UserRole['preset'],
  keys: PermissionKey[],
): UserRole => ({
  id,
  name,
  preset,
  defaultPermissions: keys,
});
const OWNER = role('r-owner', 'Owner', 'owner', PRESET_KEYS.owner);
const DESIGNER = role('r-designer', 'Designer', 'designer', PRESET_KEYS.designer);
const FOREMAN = role('r-foreman', 'Foreman', 'foreman', PRESET_KEYS.foreman);
const CREW = role('r-crew', 'Crew', 'crew', PRESET_KEYS.crew);

const row = (r: UserRole, granted: PermissionKey[], language: 'en' | 'es' = 'en'): UserRow => ({
  membershipId: 'm1',
  status: 'active',
  name: 'Ann',
  email: 'ann@example.test',
  language,
  role: r,
  grantedKeys: granted,
  lastActiveAt: null,
  invitedAt: null,
  canCopyLink: false,
});

const counts = (d: InspectorDraft) =>
  Object.fromEntries(groupCounts(d.granted).map((g) => [g.group, `${g.granted} of ${g.total}`]));

describe('EZD-106 inspector draft', () => {
  it('preset sizes and group sizes', () => {
    expect([OWNER, DESIGNER, FOREMAN, CREW].map((r) => r.defaultPermissions.length)).toEqual([
      37, 26, 11, 4,
    ]);
    expect(groupCounts([]).map((g) => [g.group, g.total])).toEqual([
      ['projects', 7],
      ['renders', 5],
      ['money', 5],
      ['issue_send', 4],
      ['field', 6],
      ['admin', 10],
    ]);
  });

  it('09n row 1: Owner unchanged is 37 and not modified', () => {
    const d = draftOf(row(OWNER, PRESET_KEYS.owner));
    expect(d.granted).toHaveLength(37);
    expect(draftModified(d, OWNER)).toBe(false);
  });

  it('09n row 2: Crew unchanged is 4 and not modified', () => {
    const d = draftOf(row(CREW, PRESET_KEYS.crew));
    expect(d.granted).toHaveLength(4);
    expect(draftModified(d, CREW)).toBe(false);
  });

  it('09n row 3: Foreman with See company costs is 12 and modified', () => {
    const d = draftOf(row(FOREMAN, [...PRESET_KEYS.foreman, 'see_company_costs']));
    expect(d.granted).toHaveLength(12);
    expect(draftModified(d, FOREMAN)).toBe(true);
    expect(counts(d).money).toBe('1 of 5');
  });

  it('09n row 4: Designer admin group is 2 of 10', () => {
    const d = draftOf(row(DESIGNER, PRESET_KEYS.designer));
    expect(counts(d).admin).toBe('2 of 10');
  });

  it('09n row 5: Foreman with one switch unticked, then Reset: back to 11, not modified', () => {
    const saved = draftOf(row(FOREMAN, PRESET_KEYS.foreman));
    const edited = toggleSwitch(saved, 'export');
    expect(edited.granted).toHaveLength(10);
    expect(draftModified(edited, FOREMAN)).toBe(true);
    expect(pendingEdits(saved, edited)).toBe(1);
    const reset = resetToRole(edited, FOREMAN);
    expect(reset.granted).toHaveLength(11);
    expect(draftModified(reset, FOREMAN)).toBe(false);
    expect(pendingEdits(saved, reset)).toBe(0);
  });

  it('choosing a role re-ticks all 37 switches to its defaults', () => {
    const saved = draftOf(row(FOREMAN, [...PRESET_KEYS.foreman, 'see_company_costs']));
    const crew = chooseRole(saved, CREW);
    expect(crew.roleId).toBe('r-crew');
    expect([...crew.granted].sort()).toEqual([...PRESET_KEYS.crew].sort());
    expect(draftModified(crew, CREW)).toBe(false);
    // Foreman 12 to Crew 4: 8 switches go off, none goes on; plus 1 for the role.
    expect(pendingEdits(saved, crew)).toBe(9);
    expect(counts(crew)).toEqual({
      projects: '1 of 7',
      renders: '0 of 5',
      money: '0 of 5',
      issue_send: '0 of 4',
      field: '3 of 6',
      admin: '0 of 10',
    });
  });

  it('a language change counts one pending edit', () => {
    const saved = draftOf(row(CREW, PRESET_KEYS.crew, 'en'));
    expect(pendingEdits(saved, { ...saved, language: 'es' })).toBe(1);
  });

  it('toggling a switch twice leaves the draft as saved', () => {
    const saved = draftOf(row(CREW, PRESET_KEYS.crew));
    const back = toggleSwitch(toggleSwitch(saved, 'export'), 'export');
    expect(back).toEqual(saved);
    expect(pendingEdits(saved, back)).toBe(0);
  });
});
