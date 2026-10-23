// EZD-021 Step 4 (vault/plans/EZD-021.md): Gemini image editing over plain HTTP (generateContent). The base URL
// is a setting (Q-0076); the client passes it in.
import { AiError } from '../errors';
import type { ImageEditRequest } from '../types';
import {
  fromBase64,
  isRecord,
  readJson,
  send,
  toBase64,
  type AdapterContext,
  type ImageAdapterResult,
} from './http';

const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export async function geminiEditImage(
  ctx: AdapterContext,
  baseUrl: string,
  req: ImageEditRequest,
): Promise<ImageAdapterResult> {
  const response = await send(
    ctx,
    'gemini',
    `${baseUrl}/v1beta/models/${req.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: req.instruction },
              { inlineData: { mimeType: req.image.mediaType, data: toBase64(req.image.data) } },
            ],
          },
        ],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  );
  const body = await readJson(response, 'gemini');
  const bad = () => new AiError('ai_bad_response', { retry: false, provider: 'gemini' });
  if (!isRecord(body) || !Array.isArray(body.candidates)) throw bad();

  let inline: Record<string, unknown> | null = null;
  for (const candidate of body.candidates) {
    const parts =
      isRecord(candidate) && isRecord(candidate.content) ? candidate.content.parts : null;
    if (!Array.isArray(parts)) continue;
    const part = parts.find((p) => isRecord(p) && isRecord(p.inlineData));
    if (part) {
      inline = part.inlineData as Record<string, unknown>;
      break;
    }
  }
  if (!inline) throw new AiError('ai_no_output', { retry: false, provider: 'gemini' });
  const mediaType = MEDIA_TYPES.find((t) => t === inline.mimeType);
  if (!mediaType || typeof inline.data !== 'string') throw bad();

  const meta = isRecord(body.usageMetadata) ? body.usageMetadata : {};
  const count = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    image: { mediaType, data: fromBase64(inline.data, 'gemini') },
    usage: {
      inputTokens: count(meta.promptTokenCount),
      outputTokens: count(meta.candidatesTokenCount),
      images: 1,
    },
    requestId: typeof body.responseId === 'string' ? body.responseId : null,
  };
}
