// EZD-021 Step 4 (vault/plans/EZD-021.md): Claude through the official SDK. The key and the address are always
// passed, so the SDK never takes either from the environment (a real key is never used in stub mode); retries
// are off because the job queue retries (EZD-009).
import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import { CLAUDE_MODELS, FIXED_BASE_URLS } from '../config';
import { AiError } from '../errors';
import type { ClaudeContent, ClaudeRequest } from '../types';
import { mapHttpStatus, toBase64, type AdapterContext } from './http';

export type AnthropicAdapterResult = {
  text: string;
  modelId: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  requestId: string | null;
};

function toBlock(content: ClaudeContent) {
  if (content.type === 'text') return { type: 'text' as const, text: content.text };
  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: content.image.mediaType,
      data: toBase64(content.image.data),
    },
  };
}

function mapSdkError(error: unknown, signal: AbortSignal): AiError {
  if (error instanceof AiError) return error;
  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    signal.aborted
  ) {
    return new AiError('ai_provider_timeout', { retry: true, provider: 'anthropic' });
  }
  if (error instanceof APIError && typeof error.status === 'number') {
    return mapHttpStatus(error.status, 'anthropic');
  }
  return new AiError('ai_provider_unavailable', { retry: true, provider: 'anthropic' });
}

export async function anthropicMessage(
  ctx: AdapterContext,
  req: ClaudeRequest,
): Promise<AnthropicAdapterResult> {
  const client = new Anthropic({
    apiKey: ctx.apiKey,
    baseURL: FIXED_BASE_URLS.anthropic,
    fetch: ctx.fetch,
    maxRetries: 0,
    timeout: ctx.budgetMs,
    // The Messages API key header; the SDK's default Authorization header is dropped.
    defaultHeaders: { 'x-api-key': ctx.apiKey, Authorization: null },
  });
  const modelId = CLAUDE_MODELS[req.model];

  let message: Anthropic.Message;
  let requestId: string | null;
  try {
    const { data, request_id } = await client.messages
      .create(
        {
          model: modelId,
          max_tokens: req.maxTokens,
          ...(req.system !== undefined ? { system: req.system } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          messages: req.messages.map((m) => ({ role: m.role, content: m.content.map(toBlock) })),
        },
        { signal: ctx.signal },
      )
      .withResponse();
    message = data;
    requestId = request_id ?? null;
  } catch (error) {
    throw mapSdkError(error, ctx.signal);
  }

  if (!Array.isArray(message?.content)) {
    throw new AiError('ai_bad_response', { retry: false, provider: 'anthropic' });
  }
  const texts = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
  if (texts.length === 0)
    throw new AiError('ai_no_output', { retry: false, provider: 'anthropic' });
  const usage = message.usage;
  if (typeof usage?.input_tokens !== 'number' || typeof usage?.output_tokens !== 'number') {
    throw new AiError('ai_bad_response', { retry: false, provider: 'anthropic' });
  }
  return {
    text: texts.join('\n'),
    modelId,
    stopReason: message.stop_reason ?? null,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
    requestId,
  };
}
