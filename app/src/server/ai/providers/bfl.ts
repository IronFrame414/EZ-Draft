// EZD-021 Step 4 (vault/plans/EZD-021.md): Black Forest Labs (Flux) over plain HTTP. Submit, poll the returned
// polling URL every 1,000 ms with ctx.sleep, then fetch the sample without the key. The polling and sample URLs
// come from the provider's answer, so they must be https on bfl.ai (or a subdomain) or on the configured base
// URL's host, or the key could leave for another host. A bounded wait inside a server job, not a browser
// polling the app (11 rule 11); no repeating timer.
import { AiError } from '../errors';
import type { AiImage, ImageEditRequest } from '../types';
import {
  isRecord,
  mapFetchError,
  mapHttpStatus,
  readJson,
  send,
  toBase64,
  type AdapterContext,
  type ImageAdapterResult,
} from './http';

const POLL_MS = 1000;
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const bad = () => new AiError('ai_bad_response', { retry: false, provider: 'bfl' });
const timeout = () => new AiError('ai_provider_timeout', { retry: true, provider: 'bfl' });

function allowedUrl(value: unknown, baseUrl: string): string {
  if (typeof value !== 'string') throw bad();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw bad();
  }
  const host = url.hostname;
  const onBfl = host === 'bfl.ai' || host.endsWith('.bfl.ai');
  const onBase = host === new URL(baseUrl).hostname;
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    !(onBfl || onBase)
  ) {
    throw bad();
  }
  return value;
}

async function fetchSample(ctx: AdapterContext, url: string): Promise<AiImage> {
  let response: Response;
  try {
    response = await ctx.fetch(url, { method: 'GET', signal: ctx.signal });
  } catch (error) {
    throw mapFetchError(error, ctx.signal, 'bfl');
  }
  if (!response.ok) throw mapHttpStatus(response.status, 'bfl');
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const mediaType = MEDIA_TYPES.find((t) => t === type);
  if (!mediaType) throw bad();
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    throw mapFetchError(error, ctx.signal, 'bfl');
  }
  if (bytes.byteLength === 0) throw bad();
  return { mediaType, data: new Uint8Array(bytes) };
}

export async function bflEditImage(
  ctx: AdapterContext,
  baseUrl: string,
  req: ImageEditRequest,
): Promise<ImageAdapterResult> {
  const submitted = await readJson(
    await send(ctx, 'bfl', `${baseUrl}/v1/${req.model}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-key': ctx.apiKey },
      body: JSON.stringify({ prompt: req.instruction, input_image: toBase64(req.image.data) }),
    }),
    'bfl',
  );
  if (!isRecord(submitted) || typeof submitted.id !== 'string') throw bad();
  const id = submitted.id;
  const pollingUrl = allowedUrl(submitted.polling_url, baseUrl);

  for (;;) {
    if (ctx.signal.aborted) throw timeout();
    const answer = await readJson(
      await send(ctx, 'bfl', pollingUrl, { method: 'GET', headers: { 'x-key': ctx.apiKey } }),
      'bfl',
    );
    if (!isRecord(answer)) throw bad();
    switch (answer.status) {
      case 'Pending':
        if (ctx.timeLeft() <= POLL_MS) throw timeout();
        await ctx.sleep(POLL_MS);
        continue;
      case 'Ready': {
        const sample = allowedUrl(isRecord(answer.result) ? answer.result.sample : null, baseUrl);
        const image = await fetchSample(ctx, sample);
        return {
          image,
          usage: { inputTokens: null, outputTokens: null, images: 1 },
          requestId: id,
        };
      }
      case 'Request Moderated':
      case 'Content Moderated':
        throw new AiError('ai_no_output', { retry: false, provider: 'bfl' });
      case 'Error':
      case 'Failed':
        throw new AiError('ai_provider_unavailable', { retry: true, provider: 'bfl' });
      default:
        throw bad();
    }
  }
}
