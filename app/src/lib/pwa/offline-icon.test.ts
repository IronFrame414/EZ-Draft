// EZD-1401 (S17 Offline status icon: Green "offline_pin" = pack cached; spinner while caching; amber with count =
// offline with n queued actions; AC-EZD-1401-1 "with the network off ... the icon shows cached").
import { describe, expect, it } from 'vitest';
import { offlineIcon } from './offline-icon';

describe('EZD-1401 offline icon state', () => {
  it('cached once the project data and its page are on the device, online or off', () => {
    expect(offlineIcon({ online: true, model: 'stored', page: true, queued: 0 })).toEqual({ kind: 'cached' });
    expect(offlineIcon({ online: false, model: 'stored', page: true, queued: 0 })).toEqual({ kind: 'cached' });
  });

  it('spinner while caching: the data is being stored, or stored with the page not yet', () => {
    expect(offlineIcon({ online: true, model: 'storing', page: false, queued: 0 })).toEqual({ kind: 'caching' });
    expect(offlineIcon({ online: true, model: 'stored', page: false, queued: 0 })).toEqual({ kind: 'caching' });
  });

  it('amber with the count while offline with queued changes', () => {
    expect(offlineIcon({ online: false, model: 'stored', page: true, queued: 3 })).toEqual({
      kind: 'queued',
      count: 3,
    });
    // Online, queued changes are syncing: the copy still reads as cached.
    expect(offlineIcon({ online: true, model: 'stored', page: true, queued: 3 })).toEqual({ kind: 'cached' });
  });

  it('nothing before the first store, after a failed store, or offline with nothing stored', () => {
    expect(offlineIcon({ online: true, model: 'none', page: false, queued: 0 })).toBeNull();
    expect(offlineIcon({ online: true, model: 'failed', page: true, queued: 0 })).toBeNull();
    expect(offlineIcon({ online: false, model: 'storing', page: false, queued: 0 })).toBeNull();
  });
});
