import { z } from 'zod';
import type { NotificationKind, NotificationParams } from './kinds';

const noParams = z.strictObject({});

export const NOTIFICATION_PARAM_SCHEMAS: Record<NotificationKind, z.ZodType<NotificationParams>> = {
  client_response: z.strictObject({
    action: z.enum(['approved', 'commented']),
    version: z.string().min(1).max(40),
  }),
  field_conflict: noParams,
  field_measurements_received: noParams,
  render_finished: noParams,
  edit_request: z.strictObject({ name: z.string().min(1).max(100) }),
  // EZD-299a Build step 15 (vault/plans/EZD-299a.md Decided D-Fit; Q-0627).
  sync_conflict: z.strictObject({
    count: z.string().regex(/^[1-9][0-9]{0,3}$/),
    names: z.string().min(1).max(4096),
    more: z.string().regex(/^(0|[1-9][0-9]{0,3})$/),
  }),
  cleanup_due: noParams,
  render_allowance_refilled: noParams,
  field_pack_issued: noParams,
};
