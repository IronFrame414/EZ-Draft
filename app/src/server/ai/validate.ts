// EZD-021 Step 4 (vault/plans/EZD-021.md): request schemas (field rules in types.ts). A request that fails is
// ai_invalid_request, before any request is sent.
import { z } from 'zod';
import { AiError } from './errors';
import type { ClaudeRequest, ImageEditRequest } from './types';

const purpose = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);

const image = z.object({
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.instanceof(Uint8Array),
});

const content = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), image }),
]);

const claudeRequestSchema = z.object({
  purpose,
  model: z.enum(['opus', 'sonnet', 'haiku']),
  system: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.array(content) }))
    .min(1)
    .refine((messages) => messages[0]?.role === 'user'),
  maxTokens: z.number().int().min(1),
  temperature: z.number().min(0).max(1).optional(),
});

const imageEditRequestSchema = z.object({
  purpose,
  provider: z.enum(['gemini', 'openai', 'bfl']),
  model: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/),
  instruction: z.string().min(1),
  image,
});

export function validateClaudeRequest(req: ClaudeRequest): void {
  if (!claudeRequestSchema.safeParse(req).success) {
    throw new AiError('ai_invalid_request', { retry: false, provider: 'anthropic' });
  }
}

export function validateImageEditRequest(req: ImageEditRequest): void {
  if (!imageEditRequestSchema.safeParse(req).success) {
    throw new AiError('ai_invalid_request', { retry: false });
  }
}
