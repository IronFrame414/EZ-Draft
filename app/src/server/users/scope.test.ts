// EZD-129 unit tests: the Project access draft (S15 Decision 13; Q-0725 (a) "n counts each pending edit against
// the saved state"), the footer count with access (lib/users/inspector.ts pendingEdits), the Foreman line rule
// (board S01bForemanStates note: no line for an All projects person) and the PUT body parse (Q-0695 decisions
// 10 row 63: zero listed projects is allowed; 03c membership: All holds no listed projects).
import { describe, expect, it } from 'vitest';
import { parseSaveScopeInput, parseScopeSearch } from './scope';
import { pendingEdits, type InspectorDraft } from '../../lib/users/inspector';
import {
  accessEdits,
  accessOf,
  foremanGetsListed,
  foremanName,
  savedProjectIds,
  setAccessScope,
  toggleAccessProject,
  type AccessDraft,
} from '../../lib/users/scope';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('EZD-129 access draft', () => {
  it('accessOf keeps the listed ids sorted, and none for All', () => {
    expect(
      accessOf({
        scope: 'listed',
        projects: [
          { id: B, name: 'b' },
          { id: A, name: 'a' },
        ],
      }),
    ).toEqual({ scope: 'listed', projectIds: [A, B] });
    expect(accessOf({ scope: 'all', projects: [] })).toEqual({ scope: 'all', projectIds: [] });
  });

  it('toggling adds and removes; All keeps the ids in the draft but Save sends none', () => {
    let d: AccessDraft = { scope: 'listed', projectIds: [] };
    d = toggleAccessProject(d, B);
    d = toggleAccessProject(d, A);
    expect(d.projectIds).toEqual([A, B]);
    d = toggleAccessProject(d, B);
    expect(d.projectIds).toEqual([A]);
    const all = setAccessScope(d, 'all');
    expect(all.projectIds).toEqual([A]);
    expect(savedProjectIds(all)).toEqual([]);
    expect(savedProjectIds(setAccessScope(all, 'listed'))).toEqual([A]);
  });

  it('accessEdits: 1 for a scope change, 1 per project added or removed while Listed', () => {
    const saved: AccessDraft = { scope: 'listed', projectIds: [A, B] };
    expect(accessEdits(saved, saved)).toBe(0);
    expect(accessEdits(saved, { scope: 'listed', projectIds: [B, C] })).toBe(2);
    expect(accessEdits(saved, { scope: 'all', projectIds: [A, B] })).toBe(1);
    expect(accessEdits({ scope: 'all', projectIds: [] }, { scope: 'listed', projectIds: [] })).toBe(
      1,
    );
    expect(accessEdits({ scope: 'all', projectIds: [] }, { scope: 'listed', projectIds: [A] })).toBe(
      2,
    );
  });

  it('pendingEdits adds the access edits once both sides carry access', () => {
    const base: InspectorDraft = { roleId: 'r', language: 'en', granted: [] };
    const saved = { ...base, access: { scope: 'all', projectIds: [] } as AccessDraft };
    expect(pendingEdits(base, base)).toBe(0);
    expect(pendingEdits(saved, { ...saved, language: 'es' })).toBe(1);
    expect(
      pendingEdits(saved, { ...saved, language: 'es', access: { scope: 'listed', projectIds: [A] } }),
    ).toBe(3);
    // Access not loaded yet on one side: not counted.
    expect(pendingEdits(base, { ...base, access: { scope: 'listed', projectIds: [A] } })).toBe(0);
  });

  it('the Foreman line shows only for a Listed person; the name falls back to the email', () => {
    const f = { membershipId: A, name: 'Luis Ortega', email: 'l@x.com', scope: 'listed' as const };
    expect(foremanGetsListed(f)).toBe(true);
    expect(foremanGetsListed({ ...f, scope: 'all' })).toBe(false);
    expect(foremanGetsListed(null)).toBe(false);
    expect(foremanName(f)).toBe('Luis Ortega');
    expect(foremanName({ ...f, name: '  ' })).toBe('l@x.com');
    expect(foremanName({ ...f, name: null })).toBe('l@x.com');
  });
});

describe('EZD-129 PUT body and search parse', () => {
  it('accepts All with none and Listed with zero or more distinct ids', () => {
    expect(parseSaveScopeInput({ scope: 'all', projectIds: [] })).toEqual({
      scope: 'all',
      projectIds: [],
    });
    expect(parseSaveScopeInput({ scope: 'listed', projectIds: [] })).toEqual({
      scope: 'listed',
      projectIds: [],
    });
    expect(parseSaveScopeInput({ scope: 'listed', projectIds: [A, B] })?.projectIds).toEqual([A, B]);
  });

  it('refuses a bad scope, All with ids, repeats, a bad id, extra keys and over 1,000 ids', () => {
    for (const bad of [
      null,
      {},
      { scope: 'some', projectIds: [] },
      { scope: 'all', projectIds: [A] },
      { scope: 'listed', projectIds: [A, A] },
      { scope: 'listed', projectIds: [A, A.toUpperCase()] },
      { scope: 'listed', projectIds: ['x'] },
      { scope: 'listed', projectIds: [], more: true },
      { scope: 'listed' },
    ]) {
      expect(parseSaveScopeInput(bad), JSON.stringify(bad)).toBeNull();
    }
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(parseSaveScopeInput({ scope: 'listed', projectIds: many(1000) })).not.toBeNull();
    expect(parseSaveScopeInput({ scope: 'listed', projectIds: many(1001) })).toBeNull();
  });

  it('search: trimmed, up to 200 characters', () => {
    expect(parseScopeSearch(new URLSearchParams(''))).toBe('');
    expect(parseScopeSearch(new URLSearchParams({ q: '  oak ' }))).toBe('oak');
    expect(parseScopeSearch(new URLSearchParams({ q: 'x'.repeat(200) }))).toBe('x'.repeat(200));
    expect(parseScopeSearch(new URLSearchParams({ q: 'x'.repeat(201) }))).toBeNull();
  });
});
