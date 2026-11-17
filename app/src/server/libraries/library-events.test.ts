// EZD-131 (S15h Events emitted; 07 Hooks log-only screen events): the three library events are registered as
// log-only and each event log row names the library item as its object.
import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../lib/events/registry';
import type { EmittedEvent } from '../events/emit';
import { EVENT_LOG } from '../events/event-log';

const ID = '00000000-0000-4000-8000-0000000000aa';
const T = '00000000-0000-4000-8000-0000000000bb';

describe('EZD-131 library events', () => {
  it('registers library.item_created, _updated and _deleted as log-only, written to the log with the item', () => {
    const base = { tenantId: T, projectId: null, actorId: null, at: '2026-11-13T00:00:00Z' };
    const cases = [
      ['library.item_created', { itemId: ID, kind: 'abbreviation' }],
      ['library.item_updated', { itemId: ID, kind: 'saved_group', fields: ['name'] }],
      ['library.item_deleted', { itemId: ID, kind: 'saved_group', name: 'Vanity set' }],
    ] as const;
    for (const [name, payload] of cases) {
      expect(EVENTS[name].kind, name).toBe('log_only');
      const rule = EVENT_LOG[name];
      expect(rule.mode, name).toBe('sink');
      if (rule.mode !== 'sink') continue;
      const event = { ...base, name, payload } as unknown as EmittedEvent<typeof name>;
      expect((rule.object as (e: typeof event) => unknown)(event), name).toEqual({
        type: 'library_item',
        id: ID,
      });
    }
  });
});
