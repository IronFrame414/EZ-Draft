// EZD-5602 Build step 5 (vault/plans/EZD-5602.md section 1 Decided "D-Cost"; 09l; Q-0638 limits row;
// AC-EZD-5602-7): the assistant's cost of one prompt, held as whole micro-dollars, and its shown line. Browser and
// server both use it. The prices are whole dollars per million tokens, so the cost is exact; a price change is a
// ticket.
export const ASSISTANT_MODELS = ['sonnet', 'opus'] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number];

// claude.com/pricing and platform.claude.com/docs/en/models/overview, read 2026-11-07 (09l)
export const ASSISTANT_PRICES: Readonly<
  Record<AssistantModel, { inputUsdPerMTok: number; outputUsdPerMTok: number }>
> = {
  sonnet: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
  opus: { inputUsdPerMTok: 4, outputUsdPerMTok: 20 },
};

export type TokenUsage = { inputTokens: number; outputTokens: number };

const isTokenCount = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function assistantCostMicroUsd(model: AssistantModel, usage: TokenUsage): number {
  if (!isTokenCount(usage.inputTokens) || !isTokenCount(usage.outputTokens)) {
    throw new RangeError('token counts must be safe non-negative integers');
  }
  const price = ASSISTANT_PRICES[model];
  return usage.inputTokens * price.inputUsdPerMTok + usage.outputTokens * price.outputUsdPerMTok;
}

export function formatUsd(microUsd: number): string {
  let cents = Math.floor((microUsd + 5000) / 10000);
  if (microUsd > 0 && cents === 0) cents = 1;
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function sessionTotalMicroUsd(costs: readonly number[]): number {
  return costs.reduce((sum, cost) => sum + cost, 0);
}
