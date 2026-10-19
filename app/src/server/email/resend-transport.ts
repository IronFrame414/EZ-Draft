// EZD-008a Step 5 · Resend transport. Never reaches the network under Vitest without an injected client.
import { Resend } from 'resend';
import type { EmailTransport } from './types';

export type ResendClientLike = {
  emails: {
    send(
      payload: {
        from: string;
        to: string;
        replyTo?: string;
        subject: string;
        text: string;
        html: string;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{
      data: { id: string } | null;
      error: { name: string; message?: string } | null;
    }>;
  };
};

export function createResendTransport(opts: {
  apiKey: string;
  client?: ResendClientLike;
}): EmailTransport {
  let client: ResendClientLike | undefined = opts.client;
  return {
    name: 'resend',
    async send(message, sendOpts) {
      if (!client) {
        if (process.env.VITEST) return { ok: false, code: 'email_live_blocked_in_tests' };
        const real: ResendClientLike = new Resend(opts.apiKey);
        client = real;
      }
      const payload = {
        from: message.from,
        to: message.to,
        ...(message.replyTo !== undefined ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
      };
      try {
        const res = sendOpts?.idempotencyKey
          ? await client.emails.send(payload, { idempotencyKey: sendOpts.idempotencyKey })
          : await client.emails.send(payload);
        if (res.error || !res.data) return { ok: false, code: 'email_provider_error' };
        return { ok: true, messageId: res.data.id };
      } catch {
        return { ok: false, code: 'email_provider_error' };
      }
    },
  };
}
