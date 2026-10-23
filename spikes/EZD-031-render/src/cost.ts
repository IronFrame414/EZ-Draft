// EZD-031 Step 4: usage x published rate, in whole micro-dollars (one Math.round on the sum).
import type { ImageAdapterResult } from '../../../app/src/server/ai/providers/http';
import type { PriceEntry } from './manifest';

export type ImageUsage = ImageAdapterResult['usage'];
export type CostReason = 'price_not_set' | 'usage_missing' | 'render_failed';

export function costFor(
  usage: ImageUsage | null,
  price: PriceEntry | null,
): { costMicroUsd: number | null; costUsd: number | null; reason: CostReason | null } {
  const none = (reason: CostReason) => ({ costMicroUsd: null, costUsd: null, reason });
  if (usage === null) return none('render_failed');
  if (price === null) return none('price_not_set');
  let micro: number;
  if (price.unit === 'per_token') {
    if (price.inputPerMTok === null || price.outputPerMTok === null) return none('price_not_set');
    if (usage.inputTokens === null || usage.outputTokens === null) return none('usage_missing');
    micro = Math.round(
      usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok,
    );
  } else {
    if (price.perImage === null) return none('price_not_set');
    micro = Math.round(usage.images * price.perImage * 1_000_000);
  }
  return { costMicroUsd: micro, costUsd: micro / 1_000_000, reason: null };
}
