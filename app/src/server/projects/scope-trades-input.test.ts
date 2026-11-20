// EZD-739 (AC-EZD-739-1, -2; Q-0764; Q-0779; vault/build/assumptions.md EZD-739). The wizard draft, the create
// body and its parse, and the Project settings draft, PATCH body and its parse. Expected values: four boxes,
// 'electrical', 'plumbing', 'mechanical', 'rcp' in that order, none ticked by default; a ticked box goes with the
// create and with the save; the save sends the boxes only when the ticked set changed; an unknown value or a repeat
// is refused.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_NEW_PROJECT,
  SCOPE_TRADES,
  isDraftEdited,
  toCreateBody,
  toggleScopeTrade,
} from '../../lib/projects/new-project';
import {
  draftOf,
  editableFor,
  toPatchBody,
  type ProjectSettings,
} from '../../lib/projects/project-settings';
import { parseProjectSettingsPatch } from './project-settings';
import { parseNewProject } from './projects';

const BASE = { name: 'A', address: '1 Main', type: 'kitchen', customerId: null, scopeOfWork: '' };

const settings = (scopeTrades?: ProjectSettings['project']['scopeTrades']): ProjectSettings => ({
  project: {
    id: 'p1',
    name: 'Lee kitchen',
    address: '1 Oak St',
    type: 'kitchen',
    scopeOfWork: '',
    ...(scopeTrades ? { scopeTrades } : {}),
  },
  client: null,
  defaults: {},
  codeEdition: { own: null, effective: 'fbc9_nec2023' },
  can: { details: true, client: false, typeAndDefaults: true },
});

describe('EZD-739 the wizard', () => {
  it('AC-1: the four boxes, none ticked on a new project', () => {
    expect(SCOPE_TRADES).toEqual(['electrical', 'plumbing', 'mechanical', 'rcp']);
    expect(EMPTY_NEW_PROJECT.scopeTrades).toEqual([]);
  });

  it('ticking keeps the fixed order; unticking removes the box; a ticked box counts as an edit', () => {
    const a = toggleScopeTrade([], 'rcp', true);
    const b = toggleScopeTrade(a, 'electrical', true);
    expect(b).toEqual(['electrical', 'rcp']);
    expect(toggleScopeTrade(b, 'rcp', false)).toEqual(['electrical']);
    expect(toggleScopeTrade(b, 'rcp', true)).toEqual(['electrical', 'rcp']);
    expect(isDraftEdited({ ...EMPTY_NEW_PROJECT, scopeTrades: ['plumbing'] })).toBe(true);
  });

  it('AC-2: the create body carries the ticked boxes and the server reads them', () => {
    const body = toCreateBody({
      ...EMPTY_NEW_PROJECT,
      name: 'A',
      address: '1 Main',
      type: 'bath',
      scopeTrades: ['mechanical', 'plumbing'],
    });
    expect(body?.scopeTrades).toEqual(['plumbing', 'mechanical']);
    expect(parseNewProject(body)?.scopeTrades).toEqual(['plumbing', 'mechanical']);
  });

  it('the server reads no boxes as none ticked and refuses an unknown value or a repeat', () => {
    expect(parseNewProject(BASE)?.scopeTrades).toBeUndefined();
    expect(parseNewProject({ ...BASE, scopeTrades: [] })?.scopeTrades).toBeUndefined();
    expect(parseNewProject({ ...BASE, scopeTrades: ['rcp', 'electrical'] })?.scopeTrades).toEqual([
      'electrical',
      'rcp',
    ]);
    expect(parseNewProject({ ...BASE, scopeTrades: ['hvac'] })).toBeNull();
    expect(parseNewProject({ ...BASE, scopeTrades: ['rcp', 'rcp'] })).toBeNull();
    expect(parseNewProject({ ...BASE, scopeTrades: 'rcp' })).toBeNull();
  });
});

describe('EZD-739 Project settings', () => {
  it('AC-1/AC-2: the draft starts from the stored boxes (none when the read has none)', () => {
    expect(draftOf(settings()).scopeTrades).toEqual([]);
    expect(draftOf(settings(['rcp', 'plumbing'])).scopeTrades).toEqual(['plumbing', 'rcp']);
  });

  it('AC-2: a changed set is sent; the same set in another order is not', () => {
    const s = settings(['electrical']);
    const e = editableFor(s, false);
    const ticked = toPatchBody(s, { ...draftOf(s), scopeTrades: ['rcp', 'electrical'] }, e, null);
    expect(ticked).toEqual({ ok: true, body: { scopeTrades: ['electrical', 'rcp'] } });
    const same = toPatchBody(s, { ...draftOf(s), scopeTrades: ['electrical'] }, e, null);
    expect(same).toEqual({ ok: true, body: {} });
    const cleared = toPatchBody(s, { ...draftOf(s), scopeTrades: [] }, e, null);
    expect(cleared).toEqual({ ok: true, body: { scopeTrades: [] } });
  });

  it('without Edit model the boxes are not sent', () => {
    const s = { ...settings(), can: { details: false, client: false, typeAndDefaults: false } };
    const r = toPatchBody(s, { ...draftOf(s), scopeTrades: ['plumbing'] }, editableFor(s, false), null);
    expect(r).toEqual({ ok: true, body: {} });
  });

  it('the PATCH parse takes the boxes in the fixed order and refuses an unknown value or a repeat', () => {
    expect(parseProjectSettingsPatch({ scopeTrades: ['rcp', 'mechanical'] })).toEqual({
      ok: true,
      patch: { scopeTrades: ['mechanical', 'rcp'] },
    });
    expect(parseProjectSettingsPatch({ scopeTrades: [] })).toEqual({
      ok: true,
      patch: { scopeTrades: [] },
    });
    expect(parseProjectSettingsPatch({ scopeTrades: ['gas'] }).ok).toBe(false);
    expect(parseProjectSettingsPatch({ scopeTrades: ['rcp', 'rcp'] }).ok).toBe(false);
  });
});
