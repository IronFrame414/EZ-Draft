// EZD-021 Step 1 (vault/plans/EZD-021.md): AI failures. An AiError is a JobError, so the runner keeps `retry`
// and writes only the code to job.error (EZD-009). `message` is a fixed English text per code; provider error
// bodies, prompts, image bytes and keys never go into it.
import { JobError } from '../jobs/errors';
import type { AiProvider } from './types';

export const AI_ERROR_MESSAGES = {
  ai_mode_not_set: 'AI mode not set',
  ai_stub_not_allowed: 'AI stub not allowed in production',
  ai_key_not_set: 'AI key not set',
  ai_base_url_invalid: 'AI base URL invalid',
  ai_invalid_request: 'AI request invalid',
  ai_key_rejected: 'AI key rejected',
  ai_provider_rejected: 'AI provider rejected the request',
  ai_rate_limited: 'AI provider rate limit',
  ai_provider_unavailable: 'AI provider unavailable',
  ai_provider_timeout: 'AI provider timed out',
  ai_no_output: 'AI provider returned no output',
  ai_bad_response: 'AI provider response unreadable',
  ai_stub_no_recording: 'AI stub has no recording',
  ai_stub_mismatch: 'AI stub request does not match the recording',
} as const;

export type AiErrorCode = keyof typeof AI_ERROR_MESSAGES;

export class AiError extends JobError {
  readonly provider?: AiProvider;
  readonly status?: number;

  constructor(
    code: AiErrorCode,
    { retry, provider, status }: { retry: boolean; provider?: AiProvider; status?: number },
  ) {
    super(code, { retry });
    this.message = AI_ERROR_MESSAGES[code];
    this.name = 'AiError';
    if (provider !== undefined) this.provider = provider;
    if (status !== undefined) this.status = status;
  }
}
