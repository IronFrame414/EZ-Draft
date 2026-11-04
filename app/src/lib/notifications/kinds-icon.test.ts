// EZD-110b T12 (vault/plans/EZD-110b.md sections 3 and 4; AC-EZD-110-2): notificationIcon returns the icon of
// each kind. Expected names: section 3 "notificationIcon" row (board 01c; section 6 icons row).
import { describe, expect, it } from 'vitest';
import { notificationIcon } from './kinds';
import type { NotificationKind, NotificationParams } from './kinds';

const CASES: ReadonlyArray<readonly [NotificationKind, NotificationParams, string]> = [
  ['client_response', { action: 'approved' }, 'check_circle'],
  ['client_response', { action: 'commented' }, 'chat_bubble'],
  ['field_conflict', {}, 'compare_arrows'],
  ['field_measurements_received', {}, 'straighten'],
  ['render_finished', {}, 'photo_camera'],
  ['edit_request', {}, 'edit'],
  ['sync_conflict', {}, 'sync_problem'],
  ['cleanup_due', {}, 'event'],
  ['render_allowance_refilled', {}, 'autorenew'],
  ['field_pack_issued', {}, 'assignment'],
];

describe('EZD-110b notification icons', () => {
  it('EZD-110b T12 each kind has its icon', () => {
    for (const [kind, params, icon] of CASES) {
      expect(notificationIcon(kind, params), `${kind} ${JSON.stringify(params)}`).toBe(icon);
    }
  });
});
