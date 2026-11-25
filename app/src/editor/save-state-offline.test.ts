// EZD-1402 (04 Header card subtitle 'Client · version · save state ("Saved just now", "Saving…", "Offline, 3
// changes queued")'; 11 Offline "Status shows queued change count"): the offline save word counts the queued
// changes. Expected values: the 04 wording; with nothing queued (or the count not read) the EZD-120c word stays.
import { describe, expect, it } from 'vitest';
import { catalogFor } from '../server/messages/catalog';
import { saveWord } from './save-state';

const en = catalogFor('office', 'en') as Record<string, unknown>;

describe('EZD-1402 offline save word', () => {
  it('offline with 3 queued reads "Offline, 3 changes queued"', () => {
    expect(saveWord({ status: 'offline', lastSavedAt: null, queued: 3 }, 0)).toEqual({
      key: 'offline_queued',
      params: { count: 3 },
    });
    expect(en['office.editor.offline_queued']).toEqual({
      one: 'Offline, {count} change queued',
      other: 'Offline, {count} changes queued',
    });
  });

  it('offline with none queued, or the count not read, keeps "Saved on this device"', () => {
    expect(saveWord({ status: 'offline', lastSavedAt: null, queued: 0 }, 0)).toEqual({
      key: 'saved_on_device',
    });
    expect(saveWord({ status: 'offline', lastSavedAt: null }, 0)).toEqual({
      key: 'saved_on_device',
    });
  });

  it('online states ignore the count', () => {
    expect(saveWord({ status: 'saving', lastSavedAt: null, queued: 3 }, 0)).toEqual({
      key: 'saving',
    });
  });
});
