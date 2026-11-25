// EZD-202 Build step 3 (vault/plans/EZD-202.md section 3 `floorDataSchema`): a floor's data is flat. A unique
// `order` is left to the floor tools (Q-0509).
import * as z from 'zod/mini';

export const floorDataSchema = z.strictObject({
  name: z.string().check(z.minLength(1)),
  order: z.int().check(z.gte(1)),
});
export type FloorData = z.infer<typeof floorDataSchema>;
