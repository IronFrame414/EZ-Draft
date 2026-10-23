// EZD-021 T12 (b): AI_MODE=live with all four keys set, so the adapters use the (guarded) global fetch. Each call
// is in try/catch; the guard's rejection reaches the adapters as a network error. The suite must still fail and
// name the four provider hosts. Run only by net-guard.test.ts.
import { describe, it, vi } from 'vitest';
import { makeAiTestContext } from '../../ai/context';
import { callClaude, editImage } from '../../../src/server/ai';
import { STUB_PNG } from '../../../src/server/ai/test-harness/recordings/image';

describe('EZD-021 probe: live AI calls', () => {
  it('EZD-021 probe calls every provider in live mode and swallows the errors', async () => {
    vi.stubEnv('AI_MODE', 'live');
    for (const name of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'BFL_API_KEY']) {
      vi.stubEnv(name, 'probe-key');
    }
    const image = { mediaType: 'image/png' as const, data: STUB_PNG };
    await callClaude(makeAiTestContext(), {
      purpose: 'test.echo',
      model: 'haiku',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'probe' }] }],
      maxTokens: 8,
    }).catch(() => undefined);
    for (const [provider, model] of [
      ['gemini', 'gemini-test-model'],
      ['openai', 'gpt-image-test'],
      ['bfl', 'flux-kontext-pro'],
    ] as const) {
      await editImage(makeAiTestContext(), {
        purpose: 'test.image_edit',
        provider,
        model,
        instruction: 'probe',
        image,
      }).catch(() => undefined);
    }
  });
});
