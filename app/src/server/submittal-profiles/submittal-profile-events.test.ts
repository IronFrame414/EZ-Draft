// EZD-712 (S15c Events emitted: submittal_profile.created, submittal_profile.updated, submittal_profile.deleted,
// all new). Each is registered as log_only and written to event_log by the sink with the profile as its object.
import { describe, expect, it } from 'vitest';
import { EVENTS, isRegisteredEvent } from '../../lib/events/registry';
import { EVENT_ACTION_PATTERN, EVENT_LOG } from '../events/event-log';

const NAMES = [
  'submittal_profile.created',
  'submittal_profile.updated',
  'submittal_profile.deleted',
] as const;

describe('EZD-712 submittal profile events', () => {
  it('the three S15c events are registered, log only, with valid action names', () => {
    for (const name of NAMES) {
      expect(isRegisteredEvent(name), name).toBe(true);
      expect(EVENTS[name].kind, name).toBe('log_only');
      expect(EVENT_ACTION_PATTERN.test(name), name).toBe(true);
    }
  });

  it('the sink logs each with the profile as the object', () => {
    const base = { tenantId: 't1', actorId: 'u1', at: new Date(0).toISOString(), id: 'e1' };
    const created = EVENT_LOG['submittal_profile.created'];
    const updated = EVENT_LOG['submittal_profile.updated'];
    const deleted = EVENT_LOG['submittal_profile.deleted'];
    if (created.mode !== 'sink' || updated.mode !== 'sink' || deleted.mode !== 'sink') {
      throw new Error('expected sink rules');
    }
    const obj = { type: 'submittal_profile', id: 'p1' };
    expect(
      created.object({
        ...base,
        name: 'submittal_profile.created',
        payload: { profileId: 'p1', sourceId: null },
      } as never),
    ).toEqual(obj);
    expect(
      updated.object({
        ...base,
        name: 'submittal_profile.updated',
        payload: { profileId: 'p1', fields: ['signer'] },
      } as never),
    ).toEqual(obj);
    expect(
      deleted.object({
        ...base,
        name: 'submittal_profile.deleted',
        payload: { profileId: 'p1', movedProjects: 0 },
      } as never),
    ).toEqual(obj);
  });
});
