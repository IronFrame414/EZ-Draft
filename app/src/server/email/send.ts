// EZD-008a Step 6 · send helper. The link is in every result, sent or failed. Nothing is logged.
import { z } from 'zod';
import { buildEmailBody } from './body';
import { getEmailTransport } from './transport';
import type { EmailMessage, SendEmailInput, SendEmailResult } from './types';

export const SENDER_SUFFIX = ' via EZ Draft';

export class EmailInputError extends Error {
  readonly code = 'email_invalid_input';
  constructor(message = 'email_invalid_input') {
    super(message);
    this.name = 'EmailInputError';
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function cleanName(name: string): string {
  return name
    .replace(/["<>\\]/g, '')
    .replace(CONTROL_CHARS, '')
    .trim();
}

const inputSchema = z.object({
  to: z.email(),
  subject: z
    .string()
    .min(1)
    .refine((s) => !/[\r\n]/.test(s)),
  paragraphs: z.array(z.string()),
  link: z.object({
    url: z.url({ protocol: /^https?$/ }),
    label: z.string().min(1),
  }),
  company: z
    .object({
      name: z.string().refine((s) => cleanName(s).length > 0),
      replyTo: z.email().nullable(),
    })
    .optional(),
  lang: z.enum(['en', 'es']).optional(),
  idempotencyKey: z.string().optional(),
});

export async function sendEmail(
  input: SendEmailInput,
  options: { env?: Record<string, string | undefined> } = {},
): Promise<SendEmailResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new EmailInputError();
  const env = options.env ?? process.env;
  const link = input.link.url;

  const chosen = getEmailTransport(env);
  if (!chosen.ok) {
    return { link, status: 'failed', transport: null, messageId: null, errorCode: chosen.code };
  }

  let from = chosen.from;
  let replyTo: string | undefined;
  if (input.company) {
    const display = cleanName(input.company.name) + SENDER_SUFFIX;
    const shown = /[()[\]:;@,.]/.test(display) ? `"${display}"` : display;
    const angle = /<([^<>]*)>\s*$/.exec(chosen.from);
    const address = angle ? angle[1].trim() : chosen.from.trim();
    from = `${shown} <${address}>`;
    if (input.company.replyTo !== null) replyTo = input.company.replyTo;
  }

  const body = buildEmailBody({
    paragraphs: input.paragraphs,
    link: input.link,
    lang: input.lang,
  });
  const message: EmailMessage = {
    from,
    to: input.to,
    ...(replyTo !== undefined ? { replyTo } : {}),
    subject: input.subject,
    text: body.text,
    html: body.html,
  };

  const res = await chosen.transport.send(
    message,
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (!res.ok) {
    return {
      link,
      status: 'failed',
      transport: chosen.transport.name,
      messageId: null,
      errorCode: res.code,
    };
  }
  return {
    link,
    status: 'sent',
    transport: chosen.transport.name,
    messageId: res.messageId,
    errorCode: null,
  };
}
