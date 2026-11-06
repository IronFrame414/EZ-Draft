// EZD-202 Build step 3 (vault/plans/EZD-202.md section 3 `floorDataSchema`): a floor's data is flat. A unique
// `order` is left to the floor tools (Q-0509).
import { z } from 'zod';

export const floorDataSchema = z.strictObject({
  name: z.string().min(1),
  order: z.int().min(1),
});
export type FloorData = z.infer<typeof floorDataSchema>;
