// EZD-008a Step 4 · transport choice. Reads env per call, never at module load.
import { z } from 'zod';
import { createResendTransport } from './resend-transport';
import type { EmailErrorCode, EmailTransport } from './types';

const emailSchema = z.email();

function isValidSender(from: string | undefined): from is string {
  if (!from) return false;
  const m = /^([^<>]*)<([^<>]*)>$/.exec(from.trim());
  if (!m) return emailSchema.safeParse(from.trim()).success;
  const name = m[1].trim();
  if (!name || /["\r\n]/.test(name)) return false;
  return emailSchema.safeParse(m[2].trim()).success;
}

// EZD-036: the stub module (node:fs) loads only when the stub transport sends.
function lazyStubTransport(dir: string | undefined): EmailTransport {
  return {
    name: 'stub',
    async send(message, sendOpts) {
      const { createStubTransport } = await import('./test-harness/stub-transport');
      return createStubTransport({ dir }).send(message, sendOpts);
    },
  };
}

export function getEmailTransport(
  env: Record<string, string | undefined>,
): { ok: true; transport: EmailTransport; from: string } | { ok: false; code: EmailErrorCode } {
  const kind = env.EMAIL_TRANSPORT;
  if (kind !== 'stub' && kind !== 'resend') return { ok: false, code: 'email_transport_not_set' };
  const from = env.EMAIL_FROM;
  if (!isValidSender(from)) return { ok: false, code: 'email_from_not_set' };
  if (kind === 'stub') {
    if (env.VERCEL_ENV === 'production') return { ok: false, code: 'email_stub_not_allowed' };
    return {
      ok: true,
      transport: lazyStubTransport(env.EMAIL_STUB_DIR || undefined),
      from,
    };
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, code: 'email_key_not_set' };
  return { ok: true, transport: createResendTransport({ apiKey }), from };
}
