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
  sync_conflict: noParams,
  cleanup_due: noParams,
  render_allowance_refilled: noParams,
  field_pack_issued: noParams,
};
