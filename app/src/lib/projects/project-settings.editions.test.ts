// EZD-643 (Q-0765; S15g Decision 2): the Project settings draft and PATCH body for the code edition and the permit
// application date. Expected values: Q-0765 (an optional permit application date in Project settings; By permit
// date makes the edition follow it; an edition picked by hand is kept) and the EZD-613 rule that the edition is sent
// only when the choice changed, so opening and saving the dialog changes nothing.
import { describe, expect, it } from 'vitest';
import { parseProjectSettingsPatch } from '../../server/projects/project-settings';
import { draftOf, toPatchBody, type ProjectSettings } from './project-settings';

const read = (
  codeEdition: ProjectSettings['codeEdition'],
  permit: string | null = null,
): ProjectSettings => ({
  project: {
    id: 'p1',
    name: 'Lee bath',
    address: '1 Oak St',
    type: 'bath',
    scopeOfWork: '',
    permitApplicationDate: permit,
  },
  client: null,
  defaults: {},
  codeEdition,
  can: { details: true, client: false, typeAndDefaults: false },
});
const EDIT = { details: true, client: false, locked: false };

describe('EZD-643 Project settings code edition and permit date', () => {
  it('an automatic project shows By permit date; a hand-picked one its edition; the date reads back', () => {
    const auto = read({ own: 'fbc8_nec2020', effective: 'fbc8_nec2020', auto: true }, '2026-12-01');
    expect(draftOf(auto).codeEdition).toBe('by_permit_date');
    expect(draftOf(auto).permitApplicationDate).toBe('2026-12-01');
    const hand = read({ own: 'fbc8_nec2020', effective: 'fbc8_nec2020', auto: false });
    expect(draftOf(hand).codeEdition).toBe('fbc8_nec2020');
    expect(draftOf(hand).permitApplicationDate).toBe('');
  });

  it('opening and saving sends nothing; a changed choice or date is sent, a cleared date as null', () => {
    const s = read({ own: 'fbc9_nec2023', effective: 'fbc9_nec2023', auto: true }, '2027-01-04');
    const d = draftOf(s);
    expect(toPatchBody(s, d, EDIT, null)).toEqual({ ok: true, body: {} });
    expect(toPatchBody(s, { ...d, codeEdition: 'fbc8_nec2020' }, EDIT, null)).toEqual({
      ok: true,
      body: { codeEdition: 'fbc8_nec2020' },
    });
    expect(toPatchBody(s, { ...d, permitApplicationDate: '2026-12-15' }, EDIT, null)).toEqual({
      ok: true,
      body: { permitApplicationDate: '2026-12-15' },
    });
    expect(toPatchBody(s, { ...d, permitApplicationDate: '' }, EDIT, null)).toEqual({
      ok: true,
      body: { permitApplicationDate: null },
    });
    const hand = read({ own: 'fbc8_nec2020', effective: 'fbc8_nec2020', auto: false });
    expect(
      toPatchBody(hand, { ...draftOf(hand), codeEdition: 'by_permit_date' }, EDIT, null),
    ).toEqual({
      ok: true,
      body: { codeEdition: 'by_permit_date' },
    });
  });

  it('a date that is not a calendar day is a field error; without Edit model nothing is sent', () => {
    const s = read({ own: 'fbc9_nec2023', effective: 'fbc9_nec2023', auto: false });
    const r = toPatchBody(s, { ...draftOf(s), permitApplicationDate: '2026-02-30' }, EDIT, null);
    expect(r.ok).toBe(false);
    expect(r.ok ? null : Object.keys(r.fields)).toEqual(['permitApplicationDate']);
    const none = { details: false, client: false, locked: false };
    expect(
      toPatchBody(s, { ...draftOf(s), permitApplicationDate: '2027-01-04' }, none, null),
    ).toEqual({
      ok: true,
      body: {},
    });
  });

  it('the server takes By permit date, both editions and a date or null; nothing else', () => {
    for (const body of [
      { codeEdition: 'by_permit_date' },
      { codeEdition: 'fbc8_nec2020' },
      { permitApplicationDate: '2026-12-31' },
      { permitApplicationDate: null },
    ]) {
      expect(parseProjectSettingsPatch(body), JSON.stringify(body)).toEqual({
        ok: true,
        patch: body,
      });
    }
    for (const bad of [
      { codeEdition: 'fbc7_nec2017' },
      { permitApplicationDate: '2026-02-30' },
      { permitApplicationDate: '12/31/2026' },
      { permitApplicationDate: 20261231 },
    ]) {
      expect(parseProjectSettingsPatch(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});
