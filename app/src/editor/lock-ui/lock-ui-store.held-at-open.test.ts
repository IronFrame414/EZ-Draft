// EZD-1976 (AC-EZD-1976-1): the lock UI loads on the first pointer input, and its first lock read answers later, on
// network time. For a tab that took the lock at open that read used to tell every lock part (a React commit in the
// middle of the first wall's pointer moves, EZD-210b B9 on CI). Expected values: 11 rule 4 (no React commit for a
// change that leaves the screen as it was); S06 Controls (Stop editing for the holder, View only while not
// holding); Q-0206 (the former holder is told when the lock went).
import { describe, expect, it, vi } from 'vitest';
import { createToastStore } from '../../components/states/toast-store';
import type { LockView } from '../lock/lock-controller';
import { createLockUiStore } from './lock-ui-store';
import { createFakeLockController } from './test-utils/fake-lock-controller';

const ME = '00000000-0000-4000-8000-00000000a001';
const A = '00000000-0000-4000-8000-00000000a002';
const SINCE = '2026-11-11T14:42:00Z';
const HELD_BY_ME = { holder: { appUserId: ME, name: 'Me Myself' }, since: SINCE };
const HELD_BY_A = { holder: { appUserId: A, name: 'Alex Holder' }, since: SINCE };
const NOT_LOADED: LockView = { status: 'loading', lock: null, mine: false };

function setup(wasHolding: boolean) {
  const fake = createFakeLockController(NOT_LOADED);
  const store = createLockUiStore({
    projectId: 'p1',
    viewerId: ME,
    canEditModel: true,
    wasHolding,
    controller: fake.controller,
    stopEditing: async () => ({ ok: true }),
    drain: async () => {},
    onLockTaken: () => {},
    onLockLeft: () => {},
    toasts: createToastStore(),
    someone: 'Someone',
    fetchPeople: async () => ({ ok: false }),
  });
  const told = vi.fn();
  store.subscribe(told);
  return { fake, store, told };
}

describe('EZD-1976 lock UI store: a lock taken at open', () => {
  it('EZD-1976 U1 the holder at open is the holder before the first read, and the read that confirms it tells nobody', () => {
    const s = setup(true);
    expect(s.store.getState()).toMatchObject({
      loaded: false,
      isHolder: true,
      viewOnly: false,
      banner: null,
    });
    s.fake.setLock(HELD_BY_ME);
    expect(s.told).toHaveBeenCalledTimes(0);
    expect(s.store.getState()).toMatchObject({
      loaded: true,
      isHolder: true,
      viewOnly: false,
      banner: null,
    });
    // A resync and a presence sync with nobody else change nothing either.
    s.fake.setLock(HELD_BY_ME);
    s.store.setPresence([ME]);
    expect(s.told).toHaveBeenCalledTimes(0);
  });

  it('EZD-1976 U2 a first read that finds the lock with someone else is told, with the lock-lost notice', () => {
    const s = setup(true);
    s.fake.setLock(HELD_BY_A);
    expect(s.told).toHaveBeenCalledTimes(1);
    expect(s.store.getState()).toMatchObject({
      loaded: true,
      isHolder: false,
      viewOnly: true,
      lockLost: 'released',
      banner: { holderId: A },
    });
  });

  it('EZD-1976 U3 a tab that did not take the lock at open is not the holder before the first read', () => {
    const s = setup(false);
    expect(s.store.getState()).toMatchObject({ loaded: false, isHolder: false, viewOnly: false });
    s.fake.setLock(HELD_BY_ME);
    expect(s.told).toHaveBeenCalledTimes(1);
    expect(s.store.getState()).toMatchObject({ loaded: true, isHolder: true });
  });
});
