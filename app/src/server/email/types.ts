// EZD-008a Step 1 · email types. Server-only by location.
export type EmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export type TransportResult =
  | { ok: true; messageId: string }
  | { ok: false; code: 'email_provider_error' | 'email_live_blocked_in_tests' };

export interface EmailTransport {
  readonly name: 'stub' | 'resend';
  send(message: EmailMessage, opts?: { idempotencyKey?: string }): Promise<TransportResult>;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  paragraphs: string[];
  link: { url: string; label: string };
  company?: { name: string; replyTo: string | null };
  lang?: 'en' | 'es';
  idempotencyKey?: string;
};

export type EmailErrorCode =
  | 'email_transport_not_set'
  | 'email_from_not_set'
  | 'email_key_not_set'
  | 'email_stub_not_allowed'
  | 'email_provider_error'
  | 'email_live_blocked_in_tests';

export type SendEmailResult = {
  link: string;
  status: 'sent' | 'failed';
  transport: 'stub' | 'resend' | null;
  messageId: string | null;
  errorCode: EmailErrorCode | null;
};
