// EZD-021 Step 4 (vault/plans/EZD-021.md): OpenAI image edits over plain HTTP (multipart form). Fixed address
// (Q-0076 covers only Gemini and Flux).
import { FIXED_BASE_URLS } from '../config';
import { AiError } from '../errors';
import type { AiImage, ImageEditRequest } from '../types';
import {
  fromBase64,
  isRecord,
  readJson,
  send,
  type AdapterContext,
  type ImageAdapterResult,
} from './http';

const EXTENSIONS: Record<AiImage['mediaType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function openaiEditImage(
  ctx: AdapterContext,
  req: ImageEditRequest,
): Promise<ImageAdapterResult> {
  const form = new FormData();
  form.append('model', req.model);
  form.append('prompt', req.instruction);
  form.append(
    'image',
    new Blob([new Uint8Array(req.image.data)], { type: req.image.mediaType }),
    `input.${EXTENSIONS[req.image.mediaType]}`,
  );
  const response = await send(ctx, 'openai', `${FIXED_BASE_URLS.openai}/v1/images/edits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ctx.apiKey}` },
    body: form,
  });
  const body = await readJson(response, 'openai');
  const bad = () => new AiError('ai_bad_response', { retry: false, provider: 'openai' });
  if (!isRecord(body) || !Array.isArray(body.data)) throw bad();
  const first = body.data[0];
  if (!isRecord(first) || typeof first.b64_json !== 'string') throw bad();

  const usage = isRecord(body.usage) ? body.usage : {};
  const count = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    image: { mediaType: 'image/png', data: fromBase64(first.b64_json, 'openai') },
    usage: {
      inputTokens: count(usage.input_tokens),
      outputTokens: count(usage.output_tokens),
      images: 1,
    },
    requestId: response.headers.get('x-request-id'),
  };
}
