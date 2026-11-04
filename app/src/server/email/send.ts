// EZD-008a Step 6 · send helper. The link is in every result, sent or failed. Nothing is logged.
import { z } from 'zod';
import { captureToSentry } from '../errors/sentry';
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
// EZD-151: characters that break a header line (CONTROL_CHARS plus U+0085, U+2028, U+2029).
// A regex with the g flag keeps lastIndex between test() calls, so the checking one has no flag.
// eslint-disable-next-line no-control-regex
const HEADER_UNSAFE = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const HEADER_UNSAFE_RUN = /[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g;

// Each run of header-unsafe characters becomes one space (EZD-151). For a subject built from free text.
export function toSubjectLine(text: string): string {
  return text.replace(HEADER_UNSAFE_RUN, ' ').trim();
}

function cleanName(name: string): string {
  return name
    .replace(/["<>\\]/g, '')
    .replace(CONTROL_CHARS, '')
    .replace(/[\u0085\u2028\u2029]/g, '')
    .trim();
}

const inputSchema = z.object({
  to: z.email(),
  subject: z
    .string()
    .min(1)
    .refine((s) => !HEADER_UNSAFE.test(s)),
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

// EZD-024 Step 9: every failed send goes to Sentry with its code only, never the recipient or the link
// (docs/architecture.md Errors and logging). No alert row: the email path itself failed.
function reportSendFailure(code: string): void {
  captureToSentry(new Error(code), { source: 'function', location: 'email.send' });
}

export async function sendEmail(
  input: SendEmailInput,
  options: { env?: Record<string, string | undefined> } = {},
): Promise<SendEmailResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new EmailInputError();
  const env = options.env ?? process.env;
  // EZD-151: on any Vercel deployment (VERCEL_ENV set) the link must be https.
  if (
    typeof env.VERCEL_ENV === 'string' &&
    env.VERCEL_ENV.trim() !== '' &&
    new URL(parsed.data.link.url).protocol !== 'https:'
  ) {
    throw new EmailInputError();
  }
  const link = input.link.url;

  const chosen = getEmailTransport(env);
  if (!chosen.ok) {
    reportSendFailure(chosen.code);
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
    reportSendFailure(res.code);
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
