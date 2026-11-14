// EZD-233 (S03 Context menu "Group"; 03f Objects inside model_json; vault/build/assumptions.md EZD-233): a group holds
// the ids of two or more objects on one level, so a click on any of them selects them all. It has no geometry of its
// own and no status. A member id that is no longer in the model reads as gone.
import { z } from 'zod';
import { levelSchema } from './common';

// A group is small; the cap keeps one stored object bounded.
export const GROUP_MEMBERS_MAX = 500;

export const groupDataSchema = z.strictObject({
  level: levelSchema,
  memberIds: z.array(z.uuid()).min(2).max(GROUP_MEMBERS_MAX),
});
export type GroupData = z.infer<typeof groupDataSchema>;
