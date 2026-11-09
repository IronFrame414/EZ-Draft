// EZD-110b T15 (vault/plans/EZD-110b.md section 4; AC-EZD-110-1, -2, -4): NotificationPanelView markup and
// bellLabel. Expected texts: board 01c, S01, D18-D22, D24 (section 6). Static markup in the office
// MessagesProvider; attribute order is not assumed.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { createT } from '../../lib/messages/t';
import type { Message } from '../../lib/messages/types';
import { catalogFor } from '../../server/messages/catalog';
import type { MessageKey } from '../../server/messages/catalog';
import type { NotificationItem } from '../../lib/notifications/kinds';
import { createNotificationStore } from '../../lib/notifications/store';
import type { NotificationApi, NotificationState } from '../../lib/notifications/store';
import type { UserHandle } from '../../lib/realtime';
import { NotificationPanelFallback, bellLabel, connectNotificationBell } from './NotificationBell';
import { NotificationPanelView } from '../../lazy/notification-panel';
import styles from './NotificationBell.module.css';

const makeItem = (n: number): NotificationItem => ({
  id: `i${n}`,
  kind: 'render_finished',
  params: {},
  link: '/',
  projectId: null,
  projectName: null,
  clientName: null,
  readAt: null,
  createdAt: `2026-10-29T15:0${n}:00.000Z`,
});

const first: NotificationItem = {
  ...makeItem(3),
  createdAt: '2026-10-29T15:56:00.000Z',
  projectName: 'Kitchen remodel',
  clientName: 'Client A',
};
const read: NotificationItem = { ...makeItem(1), readAt: '2026-10-29T15:30:00.000Z' };

const base: NotificationState = {
  status: 'ready',
  items: [],
  unreadCount: 0,
  hasMore: false,
  olderStatus: 'idle',
};

const noop = () => {};
function render(state: NotificationState): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <NotificationPanelView
        state={state}
        now={new Date('2026-10-29T16:00:00Z')}
        timeZone="America/New_York"
        onOpenItem={noop}
        onMarkAllRead={noop}
        onShowOlder={noop}
        onRetry={noop}
        onRetryOlder={noop}
      />
    </MessagesProvider>,
  );
}

const tags = (html: string, testid: string) =>
  [...html.matchAll(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`, 'g'))].map((m) => m[0]);
const textOf = (html: string, testid: string) =>
  [...html.matchAll(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>([^<]*)<`, 'g'))].map(
    (m) => m[1],
  );
// Item blocks: from one item button to the next (the last runs to the end of the markup).
const itemBlocks = (html: string) =>
  html
    .split(/(?=<button[^>]*data-testid="notification-item")/)
    .filter((b) => /^<button[^>]*data-testid="notification-item"/.test(b));

const t = createT('en', catalogFor('office', 'en') as Readonly<Record<MessageKey, Message>>);

describe('EZD-110b notification panel markup', () => {
  it('EZD-110b T15 list, empty, error and bell labels', () => {
    // list: 2 unread + 1 read + hasMore
    const list = render({
      ...base,
      items: [first, makeItem(2), read],
      unreadCount: 2,
      hasMore: true,
    });
    const blocks = itemBlocks(list);
    expect(blocks.length).toBe(3);
    expect(textOf(blocks[0], 'notification-item-time')).toEqual(['4 min ago']);
    expect(textOf(blocks[0], 'notification-item-project')).toEqual(['Kitchen remodel · Client A']);
    expect(tags(blocks[1], 'notification-item-project')).toEqual([]);
    expect(tags(blocks[2], 'notification-item-project')).toEqual([]);
    expect(tags(list, 'notification-item-project').length).toBe(1);
    expect(tags(blocks[0], 'notification-item')[0]).toContain('data-unread="true"');
    expect(tags(blocks[1], 'notification-item')[0]).toContain('data-unread="true"');
    expect(tags(blocks[2], 'notification-item')[0]).toContain('data-unread="false"');
    expect(tags(blocks[0], 'notification-item-dot')[0]).toContain('aria-label="Unread"');
    expect(tags(blocks[1], 'notification-item-dot')[0]).toContain('aria-label="Unread"');
    expect(tags(blocks[2], 'notification-item-dot')[0]).toContain('aria-label="Read"');
    expect(textOf(list, 'notification-mark-all').join('')).toContain('Mark all read');
    expect(textOf(list, 'notification-show-older').join('')).toContain('Show older');

    // empty
    const empty = render(base);
    expect(empty).toContain('No notifications yet');
    expect(tags(empty, 'notification-empty').length).toBe(1);
    expect(tags(empty, 'notification-mark-all')).toEqual([]);
    expect(tags(empty, 'notification-show-older')).toEqual([]);

    // error
    const error = render({ ...base, status: 'error' });
    expect(tags(error, 'notification-error').length).toBe(1);
    expect(error).toContain('Notifications could not load');
    expect(error).toContain('Retry');

    // bell labels
    const l0 = bellLabel(0);
    const l2 = bellLabel(2);
    expect(t(l0.key, l0.params)).toBe('Notifications');
    expect(t(l2.key, l2.params)).toBe('Notifications, 2 new');
  });
});

// EZD-110b T20 (vault/plans/EZD-110b.md section 4; D16 amended 2026-11-03, D15 single flight): the wiring of
// connectNotificationBell(store, h) with the real store, a counting fake fetchPage and a fake UserHandle.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const emptyPage = { items: [], unreadCount: 0, hasMore: false };

function makeWiring(deferred: boolean) {
  let fetchCalls = 0;
  const pending: Array<() => void> = [];
  const api: NotificationApi = {
    fetchPage: () => {
      fetchCalls++;
      if (!deferred) return Promise.resolve(emptyPage);
      return new Promise((resolve) => pending.push(() => resolve(emptyPage)));
    },
    open: () => Promise.resolve({ ok: true, link: '/' }),
    markAllRead: () => Promise.resolve(),
  };
  let resolveReady: (v: 'subscribed' | 'refused') => void = () => {};
  const ready = new Promise<'subscribed' | 'refused'>((r) => {
    resolveReady = r;
  });
  let releases = 0;
  let resyncCb: () => void = () => {};
  const off = () => {};
  const h = {
    status: 'connecting',
    ready,
    on: () => off,
    onResync: (cb: () => void) => {
      resyncCb = cb;
      return off;
    },
    onStatus: () => off,
    release: () => {
      releases++;
    },
  } as unknown as UserHandle;
  return {
    store: createNotificationStore(api),
    h,
    resolveReady,
    resync: () => resyncCb(),
    pending,
    fetchCalls: () => fetchCalls,
    releases: () => releases,
  };
}

describe('EZD-110b notification bell wiring', () => {
  it('EZD-110b T20 connectNotificationBell: mount is one fetch, ready is not read, a resync resets, cleanup releases', async () => {
    // (a) ready subscribed adds no fetch
    {
      const w = makeWiring(false);
      connectNotificationBell(w.store, w.h);
      await flush();
      w.resolveReady('subscribed');
      await flush();
      expect(w.fetchCalls(), 'a').toBe(1);
    }
    // (b) ready refused adds no fetch
    {
      const w = makeWiring(false);
      connectNotificationBell(w.store, w.h);
      await flush();
      w.resolveReady('refused');
      await flush();
      expect(w.fetchCalls(), 'b').toBe(1);
    }
    // (c) a resync adds one fetch
    {
      const w = makeWiring(false);
      connectNotificationBell(w.store, w.h);
      await flush();
      w.resync();
      await flush();
      expect(w.fetchCalls(), 'c').toBe(2);
    }
    // (d) single flight with a resync during the mount fetch
    {
      const w = makeWiring(true);
      connectNotificationBell(w.store, w.h);
      w.resync();
      w.resolveReady('subscribed');
      await flush();
      for (let i = 0; i < 10 && w.pending.length > 0; i++) {
        w.pending.shift()?.();
        await flush();
      }
      expect(w.pending.length, 'd pending').toBe(0);
      expect(w.fetchCalls(), 'd').toBe(2);
    }
    // (e) cleanup before ready: no extra fetch, one release
    {
      const w = makeWiring(false);
      const cleanup = connectNotificationBell(w.store, w.h);
      await flush();
      cleanup();
      w.resolveReady('subscribed');
      await flush();
      expect(w.fetchCalls(), 'e').toBe(1);
      expect(w.releases(), 'e releases').toBe(1);
    }
  });
});

// EZD-332 U1 (vault/plans/EZD-332.md sections 1, 3, 4; AC-EZD-332-2): the panel fallback the bell shows while the
// list code loads (failed false) and when that download fails (failed true). Decided "NotificationPanelFallback markup".
describe('EZD-332 notification panel fallback', () => {
  const renderFallback = (failed: boolean): string =>
    renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <NotificationPanelFallback failed={failed} onRetry={noop} />
      </MessagesProvider>,
    );

  it('EZD-332 U1 the panel fallback shows the skeleton while the list code loads and the inline error when it fails', () => {
    const loading = renderFallback(false);
    expect(loading).toContain('data-testid="notification-loading"');
    expect(loading).toContain('>Notifications</h2>');
    expect(loading).not.toContain('notification-error');
    expect(loading).not.toContain('notification-mark-all');

    const failed = renderFallback(true);
    expect(failed).toContain('data-testid="notification-error"');
    expect(failed).toContain('Notifications could not load');
    expect(failed).toContain('Retry');
    expect(failed).not.toContain('notification-loading');
  });
});

// EZD-299 U11 (vault/plans/EZD-299.md section 4; AC-EZD-299-7; Decided D-Bell): a sync_conflict row has the amber
// icon box; every other kind keeps the plain one.
describe('EZD-299 notification bell conflict icon', () => {
  it('U11 only the sync_conflict row adds iconBoxWarn', () => {
    const conflict: NotificationItem = {
      ...makeItem(2),
      kind: 'sync_conflict',
      params: { count: '1', names: 'Wall 4', more: '0' },
    };
    const html = render({ ...base, items: [conflict, makeItem(1)], unreadCount: 2 });
    const blocks = itemBlocks(html);
    expect(blocks.length).toBe(2);
    const iconClasses = (block: string) => {
      const m = /<span class="([^"]*)"[^>]*><svg/.exec(block);
      return (m?.[1] ?? '').split(' ').filter((c) => c.length > 0);
    };
    expect(iconClasses(blocks[0])).toEqual([styles.iconBox, styles.iconBoxWarn]);
    expect(iconClasses(blocks[1])).toEqual([styles.iconBox]);
  });
});
