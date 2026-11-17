// EZD-126 U10-U13 (AC-EZD-126-1, -2, -3, -4, -5, -7). Static markup in the office MessagesProvider. Expected text:
// board S06 lines 54, 86-91, 209-211, 256 ("[Name] is editing since 9:42 AM · view only", "You can pan, zoom and
// measure", "Request edit", "Available to edit · [Name] left the plan", "Start editing", "View only"); S06:75
// ("Requested [time]" with cancel); 04:26 (Stop editing); S06:81 (hover shows name and whether editing); the
// wording of en.ts office.lock.* and EZD-125's error.lock_released_other_device / error.stale_lock_epoch.
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createToastStore } from '../../components/states/toast-store';
import { MessagesProvider } from '../../lib/messages';
import type { OutboxSync, SyncState } from '../../lib/outbox/outbox-sync';
import { catalogFor } from '../../server/messages/catalog';
import type { LockUiState } from './lock-ui-store';
import {
  LockAwareSaveBanner,
  LockBanner,
  LockLostBanner,
  LockToasts,
  PresenceAvatars,
  StopEditingButton,
  ViewOnlyStatus,
} from './LockUi';
import styles from './LockUi.module.css';
import toastStyles from '../../components/states/Toast.module.css';

const A = '00000000-0000-4000-8000-00000000a002';
const B = '00000000-0000-4000-8000-00000000a003';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );
const EMPTY = render(<></>);
const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (html: string) => decode(html.replace(/<[^>]*>/g, ''));
const tag = (html: string, testid: string) =>
  new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`).exec(html)?.[0] ?? null;
const count = (html: string, s: string) => html.split(s).length - 1;

const BASE: LockUiState = {
  loaded: true,
  canEdit: true,
  isHolder: false,
  viewOnly: true,
  banner: {
    holderId: A,
    holderName: 'Alex Holder',
    since: '2026-11-11T14:42:00Z',
    request: { kind: 'idle' },
  },
  prompt: null,
  stopBusy: false,
  avatars: { shown: [], overflow: 0 },
  lockLost: null,
  people: new Map(),
};

const banner = (state: Partial<LockUiState>, offline = false) =>
  render(
    <LockBanner
      state={{ ...BASE, ...state }}
      offline={offline}
      onRequest={() => {}}
      onCancel={() => {}}
      timeZone="UTC"
    />,
  );
const withRequest = (request: NonNullable<LockUiState['banner']>['request']) => ({
  banner: { ...BASE.banner!, request },
});

describe('EZD-126 lock UI markup', () => {
  it('EZD-126 U10 the amber banner with the holder, since time and Request edit', () => {
    const idle = banner({});
    const root = tag(idle, 'lock-banner')!;
    expect(root).toContain('role="status"');
    expect(root).toContain(`class="${styles.banner}"`);
    expect(text(idle)).toBe(
      'Alex Holder is editing since 2:42 PM · view onlyYou can pan, zoom and measureRequest edit',
    );
    expect(idle).toContain(
      `<span class="${styles.bannerStrong}">Alex Holder is editing since 2:42 PM</span>`,
    );
    expect(idle).toContain('#ez-icon-lock');
    const request = tag(idle, 'lock-request-edit')!;
    expect(request).not.toContain('disabled');
    expect(idle).toContain('#ez-icon-front_hand');

    expect(tag(banner(withRequest({ kind: 'busy' })), 'lock-request-edit')).toContain('disabled');
    expect(tag(banner({}, true), 'lock-request-edit')).toContain('disabled');

    const requested = banner(withRequest({ kind: 'requested', requestedAt: '2026-11-11T14:43:00Z' }));
    expect(tag(requested, 'lock-requested')).toContain('disabled');
    expect(text(requested)).toContain('Requested 2:43 PM');
    expect(text(requested)).toContain('Cancel request');
    expect(tag(requested, 'lock-cancel-request')).not.toContain('disabled');
    expect(tag(requested, 'lock-request-edit')).toBeNull();

    expect(count(banner({ canEdit: false }), '<button')).toBe(0);
    expect(banner({ banner: null })).toBe(EMPTY);
    expect(text(banner({ banner: { ...BASE.banner!, holderName: null } }))).toContain(
      'Someone is editing since 2:42 PM',
    );
  });

  it('EZD-126 U11 Stop editing, View only and the presence avatars', () => {
    const stop = render(<StopEditingButton busy={false} onStop={() => {}} />);
    expect(count(stop, '<button')).toBe(1);
    const button = tag(stop, 'stop-editing')!;
    expect(button).toContain('aria-label="Stop editing"');
    expect(button).toContain('title="Stop editing"');
    expect(button).not.toContain('disabled');
    expect(stop).toContain('data-header-button-icon');
    expect(stop).toContain('#ez-icon-edit');
    expect(text(stop)).toBe('Stop editing');
    expect(tag(render(<StopEditingButton busy onStop={() => {}} />), 'stop-editing')).toContain(
      'disabled',
    );

    const view = render(<ViewOnlyStatus />);
    expect(tag(view, 'lock-view-only')).not.toBeNull();
    expect(view).toContain('#ez-icon-lock');
    expect(text(view)).toBe('View only');
    expect(view).not.toContain('data-status-item');

    const people = new Map([[A, { name: 'Alex Holder', initials: 'AH' }]]);
    const avatars = render(
      <PresenceAvatars
        avatars={{
          shown: [
            { appUserId: A, holder: true },
            { appUserId: B, holder: false },
          ],
          overflow: 2,
        }}
        people={people}
        holderName="Alex Holder"
      />,
    );
    const group = tag(avatars, 'presence-avatars')!;
    expect(group).toContain('role="group"');
    expect(group).toContain('aria-label="People in this project"');
    const each = [...avatars.matchAll(/<span[^>]*data-testid="presence-avatar"[^>]*>([^<]*)</g)];
    expect(each).toHaveLength(2);
    expect(each[0][0]).toContain('data-holder=""');
    expect(each[0][0]).toContain(`class="${styles.avatar} ${styles.holder}"`);
    expect(each[0][0]).toContain('title="Alex Holder · Editing"');
    expect(each[0][1]).toBe('AH');
    expect(each[1][0]).not.toContain('data-holder');
    expect(each[1][0]).toContain('title="Someone · Viewing"');
    expect(each[1][1]).toBe('');
    const more = tag(avatars, 'presence-overflow')!;
    expect(more).toContain('title="2 more"');
    expect(text(avatars)).toContain('+2');
    expect(
      render(<PresenceAvatars avatars={{ shown: [], overflow: 0 }} people={people} holderName={null} />),
    ).toBe(EMPTY);
  });

  it('EZD-126 U12 the lock-lost notices and the save refused for an old lock', () => {
    const auto = render(<LockLostBanner reason="auto" message="office.lock.auto_released" onClose={() => {}} />);
    expect(tag(auto, 'lock-lost-banner')).toContain('role="alert"');
    expect(tag(auto, 'lock-lost-banner')).toContain('data-reason="auto"');
    expect(text(auto)).toBe(
      'Your edit lock was released because a request went unanswered. Changes not yet saved stay on this device.',
    );
    expect(auto).toContain('aria-label="Close"');
    const other = render(
      <LockLostBanner reason="other_device" message="office.lock.other_device_released" />,
    );
    expect(text(other)).toBe(
      'Your edit lock was released from your other device or tab. Changes not yet saved stay on this device.',
    );
    expect(other).not.toContain('aria-label="Close"');

    const syncOf = (s: Partial<SyncState>) =>
      Object.assign(
        createStore<SyncState>(() => ({
          status: 'idle',
          failures: 0,
          lastSavedAt: null,
          conflictRev: 0,
          problem: null,
          ...s,
        }) as SyncState),
        { retry: vi.fn() },
      ) as unknown as OutboxSync;
    const aware = (
      s: Partial<SyncState>,
      lockLost: LockUiState['lockLost'],
      staleKey: 'error.stale_lock_epoch' | 'error.lock_released_other_device' = 'error.stale_lock_epoch',
    ) =>
      render(
        <LockAwareSaveBanner
          sync={syncOf(s)}
          lockLost={lockLost}
          staleKey={() => staleKey}
          onCloseLockLost={() => {}}
        />,
      );
    const stale = { status: 'error' as const, problem: 'stale_lock_epoch' as const };

    const someoneElse = aware(stale, null);
    expect(count(someoneElse, 'data-testid="lock-lost-banner"')).toBe(1);
    expect(text(someoneElse)).toBe("Someone else is editing this project now, so these changes weren't saved.");
    expect(someoneElse).not.toContain('save-failed-banner');
    expect(someoneElse).not.toContain('Retry');

    expect(text(aware(stale, null, 'error.lock_released_other_device'))).toBe(
      "You stopped editing this project on another device, so these changes weren't saved.",
    );
    expect(text(aware(stale, 'other_device'))).toBe(
      "You stopped editing this project on another device, so these changes weren't saved.",
    );
    expect(text(aware(stale, 'auto'))).toBe(
      'Your edit lock was released because a request went unanswered. Changes not yet saved stay on this device.',
    );

    const both = aware({ status: 'error', problem: 'storage_failed' }, 'other_device');
    expect(both).toContain('data-testid="save-failed-banner"');
    expect(tag(both, 'lock-lost-banner')).toContain('data-reason="other_device"');
    expect(both).toContain('aria-label="Close"');

    expect(aware({ status: 'saved' }, null)).toBe(EMPTY);
    expect(text(aware({ status: 'saved' }, 'released'))).toBe(
      'Your edit lock was released. Changes not yet saved stay on this device.',
    );
  });

  it('EZD-126 U13 the green Available toast at the canvas bottom right', () => {
    const toasts = createToastStore();
    toasts.show({
      message: 'office.lock.available',
      params: { name: 'Alex Holder' },
      tone: 'success',
      action: { label: 'office.lock.start_editing', onPress: () => {} },
    });
    toasts.show({ message: 'office.lock.declined', params: { name: 'Alex Holder' } });
    const html = render(<LockToasts toasts={toasts} />);
    const viewport = /<div[^>]*data-toast-viewport=""[^>]*>/.exec(html)![0];
    expect(viewport).toContain('data-placement="canvas"');
    expect(viewport).toContain(`class="${toastStyles.viewport} ${styles.toasts}"`);
    const [green, plain] = html.split('data-toast=""').slice(1);
    expect(green).toContain(`class="${toastStyles.toast} ${styles.success}"`);
    expect(green.indexOf('#ez-icon-lock_open')).toBeGreaterThan(-1);
    expect(green.indexOf('#ez-icon-lock_open')).toBeLessThan(green.indexOf('Available to edit'));
    expect(text(`<x ${green}`)).toContain('Available to edit · Alex Holder left the plan');
    expect(green).toContain('data-toast-action=""');
    expect(text(`<x ${green}`)).toContain('Start editing');
    expect(plain).toContain(`class="${toastStyles.toast}"`);
    expect(plain).not.toContain('#ez-icon-lock_open');
    expect(plain).not.toContain('data-toast-action');
    expect(text(`<x ${plain}`)).toContain('Alex Holder kept editing. You can ask again.');
  });
});
