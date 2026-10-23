// EZD-021 Step 5 (vault/plans/EZD-021.md): the non-production test purpose behind the Done when. One Claude
// call on the haiku alias; never registered in production.
import { z } from 'zod';
import { callClaude } from '../../ai';
import type { AiPurpose } from './index';

export type TestEchoInput = { prompt: string };
export type TestEchoOutput = {
  text: string;
  modelId: string;
  mode: 'stub' | 'live';
  usage: { inputTokens: number; outputTokens: number };
};

export const testEchoPurpose: AiPurpose<TestEchoInput, TestEchoOutput> = {
  purpose: 'test.echo',
  input: z.object({ prompt: z.string().min(1).max(200) }),
  output: z.object({
    text: z.string(),
    modelId: z.string(),
    mode: z.enum(['stub', 'live']),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  }),
  async run(ctx, input) {
    const result = await callClaude(ctx, {
      purpose: 'test.echo',
      model: 'haiku',
      messages: [{ role: 'user', content: [{ type: 'text', text: input.prompt }] }],
      maxTokens: 64,
    });
    return { text: result.text, modelId: result.modelId, mode: result.mode, usage: result.usage };
  },
};
