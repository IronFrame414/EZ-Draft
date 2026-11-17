// EZD-126 U17 (S06 Controls; board S06; Q-0697 decisions 05; Q-0206). Expected values: the board's text for
// banner_holder, banner_view_only, banner_hint, request_edit, available, available_free, start_editing and
// view_only; S06:75-76 for requested, prompt_title, release, keep_editing; Q-0697 05 for cancel_request; 04:26 for
// stop_editing; the rest proposed in vault/build/assumptions.md. English only (office is English in v1).
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';

const keysOf = (catalog: object) =>
  Object.keys(catalog)
    .filter((k) => k.startsWith('office.lock.'))
    .sort();

describe('EZD-126 lock messages', () => {
  it('EZD-126 U17 office.lock.* in English, none in Spanish', () => {
    const E = en as unknown as Record<string, unknown>;
    const expected: Record<string, string> = {
      'office.lock.banner_holder': '{name} is editing since {time}',
      'office.lock.banner_view_only': 'view only',
      'office.lock.banner_hint': 'You can pan, zoom and measure',
      'office.lock.request_edit': 'Request edit',
      'office.lock.requested': 'Requested {time}',
      'office.lock.cancel_request': 'Cancel request',
      'office.lock.prompt_title': '{name} wants to edit',
      'office.lock.prompt_message':
        "If you don't answer, your work is saved and the lock is released when the timer ends.",
      'office.lock.release': 'Release',
      'office.lock.keep_editing': 'Keep editing',
      'office.lock.available': 'Available to edit · {name} left the plan',
      'office.lock.available_free': 'Available to edit',
      'office.lock.start_editing': 'Start editing',
      'office.lock.stop_editing': 'Stop editing',
      'office.lock.someone': 'Someone',
      'office.lock.view_only': 'View only',
      'office.lock.declined': '{name} kept editing. You can ask again.',
      'office.lock.presence_label': 'People in this project',
      'office.lock.presence_editing': '{name} · Editing',
      'office.lock.presence_viewing': '{name} · Viewing',
      'office.lock.presence_overflow': '+{count}',
      'office.lock.presence_more': '{count} more',
      'office.lock.auto_released':
        'Your edit lock was released because a request went unanswered. Changes not yet saved stay on this device.',
      'office.lock.other_device_released':
        'Your edit lock was released from your other device or tab. Changes not yet saved stay on this device.',
      'office.lock.released': 'Your edit lock was released. Changes not yet saved stay on this device.',
      'office.lock.action_failed': "Couldn't reach the server. Try again.",
      'office.lock.stop_failed': "Couldn't stop editing. You still hold the lock.",
    };
    expect(keysOf(en)).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expect(E[key], key).toBe(value);
    expect(keysOf(es)).toEqual([]);
  });
});
