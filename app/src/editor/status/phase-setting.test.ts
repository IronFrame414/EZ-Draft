// EZD-214 (AC-EZD-214-1, -2, -3, -6, -7, -9; 09m Phase switch rows 1-7; Q-0667; Q-0670). Expected values: 09m rows
// 1-7, the Q-0667 eye defaults (Existing: Existing and Demo on, New off; Proposed: Existing and New on, Demo off),
// S03 Status bar "View" (Proposed: new objects default to New) and Q-0670 (offline: held, newest wins; online
// failure: failed, Retry). The save and the online source are stubs; no network.
import { describe, expect, it, vi } from 'vitest';
import type { ObjectStatus } from '@ezdraft/geometry';
import type { OnlineSource } from '../../lib/network/online';
import {
  eyeDefaults,
  newObjectStatus,
  phaseViewOf,
  savePhaseView,
  statusShown,
  type PhaseView,
} from '../../lib/plan/phase-view';
import { createPhaseSetting } from './phase-setting';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function stubOnline(initial: boolean) {
  let flag = initial;
  let callback: (() => void) | null = null;
  const online: OnlineSource = {
    getSnapshot: () => flag,
    subscribe: (cb) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
  };
  return {
    online,
    set: (v: boolean) => {
      flag = v;
    },
    fire: () => callback?.(),
  };
}

const okSave = () => vi.fn(async (_v: PhaseView) => true);

describe('EZD-214 phase view rules', () => {
  // 09m rows 1-6: [case, status, eye override or null, shown in Existing, shown in Proposed].
  const ROWS: Array<[number, ObjectStatus, [ObjectStatus, boolean] | null, boolean, boolean]> = [
    [1, 'existing', null, true, true],
    [2, 'new', null, false, true],
    [3, 'existing', null, true, true],
    [4, 'demo', null, true, false],
    [5, 'new', ['new', false], false, false],
    [6, 'demo', ['demo', true], true, true],
  ];

  it.each(ROWS)('09m row %i', (_row, status, eye, inExisting, inProposed) => {
    for (const [view, expected] of [
      ['existing', inExisting],
      ['proposed', inProposed],
    ] as const) {
      const setting = createPhaseSetting({ view, canEdit: false, save: okSave() });
      if (eye !== null) setting.setEye(eye[0], eye[1]);
      expect(setting.shown(status), `${view}`).toBe(expected);
    }
  });

  it('09m row 7: a project never toggled opens in Existing', () => {
    expect(phaseViewOf('existing')).toBe('existing');
    expect(phaseViewOf(null)).toBe('existing');
    expect(phaseViewOf(undefined)).toBe('existing');
    expect(phaseViewOf('x')).toBe('existing');
    expect(phaseViewOf('proposed')).toBe('proposed');
  });

  it('the eye defaults per view and the status of new objects', () => {
    expect(eyeDefaults('existing')).toEqual({ existing: true, demo: true, new: false });
    expect(eyeDefaults('proposed')).toEqual({ existing: true, demo: false, new: true });
    expect(newObjectStatus('existing')).toBe('existing');
    expect(newObjectStatus('proposed')).toBe('new');
  });

  it('an object without a status (a floor, a group) is always shown', () => {
    const none = { existing: false, demo: false, new: false };
    expect(statusShown(none, undefined)).toBe(true);
    expect(statusShown(none, 'existing')).toBe(false);
  });
});

describe('EZD-214 phase setting', () => {
  it('AC-9 a View switch resets the eyes to the view defaults; an eye override lasts until the switch', () => {
    const setting = createPhaseSetting({ view: 'existing', canEdit: true, save: okSave() });
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.setEye('new', true);
    setting.setEye('demo', false);
    expect(setting.get().eyes).toEqual({ existing: true, demo: false, new: true });
    expect(setting.get().view).toBe('existing');
    setting.setView('proposed');
    expect(setting.get()).toEqual({
      view: 'proposed',
      eyes: { existing: true, demo: false, new: true },
    });
    setting.setEye('demo', true);
    setting.setView('existing');
    expect(setting.get().eyes).toEqual({ existing: true, demo: true, new: false });
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('a switch to the current view or an eye set to its own value changes nothing', () => {
    const setting = createPhaseSetting({ view: 'proposed', canEdit: true, save: okSave() });
    const listener = vi.fn();
    setting.subscribe(listener);
    const v = setting.version();
    setting.setView('proposed');
    setting.setEye('new', true);
    expect(listener).not.toHaveBeenCalled();
    expect(setting.version()).toBe(v);
    setting.setEye('new', false);
    expect(setting.version()).toBe(v + 1);
  });

  it('AC-1 new objects follow the view', () => {
    const setting = createPhaseSetting({ view: 'existing', canEdit: true, save: okSave() });
    expect(setting.newObjectStatus()).toBe('existing');
    setting.setView('proposed');
    expect(setting.newObjectStatus()).toBe('new');
  });

  it('AC-1 an editor saves each View choice, one at a time, newest wins', async () => {
    const holds: Array<(ok: boolean) => void> = [];
    const calls: PhaseView[] = [];
    const save = (v: PhaseView) => {
      calls.push(v);
      return new Promise<boolean>((r) => holds.push(r));
    };
    const setting = createPhaseSetting({
      view: 'existing',
      canEdit: true,
      save,
      online: stubOnline(true).online,
    });
    setting.setView('proposed');
    setting.setView('existing');
    setting.setView('proposed');
    expect(calls).toEqual(['proposed']);
    holds[0]!(true);
    await flush();
    expect(calls).toEqual(['proposed', 'proposed']);
    holds[1]!(true);
    await flush();
    expect(calls).toEqual(['proposed', 'proposed']);
    expect(setting.failed()).toBe(false);
  });

  it('AC-7 a view-only user switches the display and nothing is saved', async () => {
    const save = okSave();
    const setting = createPhaseSetting({
      view: 'existing',
      canEdit: false,
      save,
      online: stubOnline(true).online,
    });
    setting.setView('proposed');
    setting.setEye('demo', true);
    await flush();
    expect(setting.get().view).toBe('proposed');
    expect(setting.shown('demo')).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('Q-0670 offline the newest choice is held and sent once back online; an online failure shows failed', async () => {
    {
      const net = stubOnline(false);
      const save = okSave();
      const setting = createPhaseSetting({
        view: 'existing',
        canEdit: true,
        save,
        online: net.online,
      });
      setting.setView('proposed');
      setting.setView('existing');
      setting.setView('proposed');
      await flush();
      expect(save).not.toHaveBeenCalled();
      expect(setting.get().view).toBe('proposed');
      net.set(true);
      net.fire();
      await flush();
      expect(save.mock.calls).toEqual([['proposed']]);
      expect(setting.failed()).toBe(false);
    }
    {
      const net = stubOnline(true);
      const answers = [false, true];
      const save = vi.fn(async (_v: PhaseView) => answers.shift()!);
      const setting = createPhaseSetting({
        view: 'existing',
        canEdit: true,
        save,
        online: net.online,
      });
      setting.setView('proposed');
      await flush();
      expect(setting.failed()).toBe(true);
      setting.retry();
      await flush();
      expect(save.mock.calls).toEqual([['proposed'], ['proposed']]);
      expect(setting.failed()).toBe(false);
    }
  });

  it('savePhaseView sends PUT { phase } and is true only on 200', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await savePhaseView('p 1', 'proposed', { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('/api/projects/p%201/phase-default', {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase: 'proposed' }),
    });
    const denied = vi.fn(async () => new Response('{}', { status: 403 }));
    expect(await savePhaseView('p', 'existing', { fetchImpl: denied })).toBe(false);
    const thrown = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await savePhaseView('p', 'existing', { fetchImpl: thrown })).toBe(false);
  });
});
