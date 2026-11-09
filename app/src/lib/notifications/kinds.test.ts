// EZD-110a T12 (vault/plans/EZD-110a.md sections 3, 4, 6; AC-EZD-110-8). Expected values: section 6 (the ten
// titles, board 01c texts), Decided D1 (the nine kinds in order), D25 (the sample params), section 3
// (NOTIFICATION_PAGE_SIZE 20, strict param schemas: edit_request name 1-100, client_response action and
// version 1-40, the rest empty).
import { describe, expect, it } from 'vitest';
import { createT } from '../messages/t';
import { catalogFor, type MessageKey } from '../../server/messages/catalog';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_SIZE,
  notificationTitle,
  type NotificationKind,
  type NotificationParams,
} from './kinds';
import { DEV_SAMPLE_PARAMS } from '../../app/dev/notifications/NotificationsProbe';
import { NOTIFICATION_PARAM_SCHEMAS } from './param-schemas';

const t = createT<MessageKey>(
  'en',
  catalogFor('office', 'en') as Parameters<typeof createT<MessageKey>>[1],
);

const SAMPLES: Array<[NotificationKind, NotificationParams, string]> = [
  ['client_response', { action: 'approved', version: 'Version 2' }, 'Client approved Version 2'],
  [
    'client_response',
    { action: 'commented', version: 'Version 2' },
    'Client commented on Version 2',
  ],
  ['field_conflict', {}, 'Field conflict to resolve'],
  ['field_measurements_received', {}, 'Field measurements received'],
  ['render_finished', {}, 'Photoreal render finished'],
  ['edit_request', { name: 'Test User' }, 'Test User asked to edit'],
  ['sync_conflict', {}, "Couldn't save 0 changes: "],
  ['cleanup_due', {}, 'Version cleanup due'],
  ['render_allowance_refilled', {}, 'Render allowance refilled'],
  ['field_pack_issued', {}, 'New field pack issued'],
];

describe('EZD-110a notification kinds', () => {
  it('EZD-110a T12 the ten titles read as drawn', () => {
    for (const [kind, params, title] of SAMPLES) {
      const { key, params: messageParams } = notificationTitle(kind, params);
      expect(t(key, messageParams), `${kind} ${JSON.stringify(params)}`).toBe(title);
    }
  });

  it('EZD-110a T12 the kinds, the page size and the param schemas follow the contract', () => {
    expect([...NOTIFICATION_KINDS]).toEqual([
      'client_response',
      'field_conflict',
      'field_measurements_received',
      'render_finished',
      'edit_request',
      'sync_conflict',
      'cleanup_due',
      'render_allowance_refilled',
      'field_pack_issued',
    ]);
    expect(NOTIFICATION_PAGE_SIZE).toBe(20);

    const ok = (kind: NotificationKind, v: unknown) =>
      NOTIFICATION_PARAM_SCHEMAS[kind].safeParse(v).success;
    expect(ok('edit_request', { name: 'a' })).toBe(true);
    expect(ok('edit_request', { name: 'a'.repeat(100) })).toBe(true);
    expect(ok('edit_request', {})).toBe(false);
    expect(ok('edit_request', { name: '' })).toBe(false);
    expect(ok('edit_request', { name: 'a'.repeat(101) })).toBe(false);
    expect(ok('edit_request', { name: 'a', extra: 'b' })).toBe(false);
    expect(ok('client_response', { action: 'approved', version: 'V' })).toBe(true);
    expect(ok('client_response', { action: 'commented', version: 'v'.repeat(40) })).toBe(true);
    expect(ok('client_response', { action: 'x', version: 'V' })).toBe(false);
    expect(ok('client_response', { action: 'approved', version: '' })).toBe(false);
    expect(ok('client_response', { action: 'approved', version: 'v'.repeat(41) })).toBe(false);
    expect(ok('render_finished', {})).toBe(true);
    expect(ok('render_finished', { a: 'b' })).toBe(false);
  });
});

// EZD-299a T16 (vault/plans/EZD-299a.md sections 4 and 6; AC-EZD-299-15). Expected values: section 6 (N1, N1b,
// Q-0627), Decided D-Title (an old `{}` row renders with count 0), step 15 (the param schema), step 17 (the
// dev sample).
describe('EZD-299a sync_conflict title', () => {
  it('EZD-299a T16 (a) the title names the count and the objects, with "and N more" past the cap', () => {
    const title = (params: NotificationParams) => {
      const { key, params: messageParams } = notificationTitle('sync_conflict', params);
      return t(key, messageParams);
    };
    expect(title({ count: '1', names: 'Wall 2', more: '0' })).toBe(
      "Couldn't save 1 change: Wall 2",
    );
    expect(title({ count: '5', names: 'Wall 4, Door 2', more: '0' })).toBe(
      "Couldn't save 5 changes: Wall 4, Door 2",
    );
    expect(title({ count: '1000', names: 'Wall 1', more: '999' })).toBe(
      "Couldn't save 1000 changes: Wall 1 and 999 more",
    );
    expect(title({})).toBe("Couldn't save 0 changes: ");
  });

  it('EZD-299a T16 (b) the param schema takes count, names and more as strings', () => {
    const ok = (v: unknown) => NOTIFICATION_PARAM_SCHEMAS.sync_conflict.safeParse(v).success;
    expect(ok({})).toBe(false);
    expect(ok({ count: '0', names: 'Wall 2', more: '0' })).toBe(false);
    expect(ok({ count: '1', names: 'Wall 2', more: '0' })).toBe(true);
  });

  it('EZD-299a T16 (c) the dev sample passes the schema', () => {
    expect(
      NOTIFICATION_PARAM_SCHEMAS.sync_conflict.safeParse(DEV_SAMPLE_PARAMS.sync_conflict).success,
    ).toBe(true);
  });
});
