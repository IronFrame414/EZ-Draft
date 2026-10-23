// EZD-024 Step 7 (vault/plans/EZD-024.md): the Sentry tunnel. The browser SDK (and later the render worker,
// Step 10) posts envelopes here, never to Sentry. Public: client-link and sign-in pages have no session. Only
// envelopes for the placeholder DSN are accepted, so the route forwards only to this app's own Sentry project
// and is never an open relay. Events are scrubbed again (never trust the browser), forwarded through the
// server client's transport (stub, real Sentry, or nothing when off) and recorded for the owner alert.
import { parseEnvelope, type Envelope } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';
import { scrubEvent, type ScrubbableEvent } from '../../../lib/errors/scrub';
import { noteBrowserEvent } from '../../../server/errors/report';
import { PLACEHOLDER_DSN } from '../../../server/errors/sentry-options';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 262_144;
const headers = { 'Cache-Control': 'no-store' };

type EventPayload = Record<string, unknown> & { tags?: Record<string, unknown> };

const TOO_LARGE = {
  error: { code: 'envelope_too_large', message_key: 'error.envelope_too_large' },
};
const INVALID = { error: { code: 'invalid_envelope', message_key: 'error.invalid_envelope' } };

function errorBody(status: 413 | 400): Response {
  return Response.json(status === 413 ? TOO_LARGE : INVALID, { status, headers });
}

function parse(
  body: Uint8Array,
): { header: Record<string, unknown>; events: EventPayload[] } | null {
  try {
    const [header, items] = parseEnvelope(body) as unknown as [
      Record<string, unknown>,
      Array<[Record<string, unknown>, unknown]>,
    ];
    if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
    if (header.dsn !== PLACEHOLDER_DSN) return null;
    const events: EventPayload[] = [];
    for (const [itemHeader, payload] of items) {
      if (itemHeader?.type !== 'event') continue;
      if (!payload || typeof payload !== 'object' || payload instanceof Uint8Array) continue;
      events.push(payload as EventPayload);
    }
    return { header, events };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) return errorBody(413);
  let body: Uint8Array;
  try {
    body = new Uint8Array(await request.arrayBuffer());
  } catch {
    return errorBody(400);
  }
  if (body.byteLength > MAX_BYTES) return errorBody(413);

  const parsed = parse(body);
  if (!parsed) return errorBody(400);

  const environment = process.env.VERCEL_ENV || 'local';
  const release = process.env.VERCEL_GIT_COMMIT_SHA || undefined;
  const events = parsed.events.map((raw) => {
    const source: 'browser' | 'worker' =
      raw.tags?.['ezd.source'] === 'worker' ? 'worker' : 'browser';
    const event: EventPayload = {
      ...scrubEvent(raw as ScrubbableEvent),
      environment,
      tags: { ...raw.tags, 'ezd.source': source },
    };
    if (release) event.release = release;
    else delete event.release;
    return { event, source };
  });

  after(async () => {
    const client = Sentry.getClient();
    const dsn = client?.getOptions().dsn;
    const transport = client?.getTransport();
    if (events.length > 0 && dsn && transport) {
      const envelope = [
        {
          ...(typeof parsed.header.event_id === 'string'
            ? { event_id: parsed.header.event_id }
            : {}),
          sent_at: new Date().toISOString(),
          dsn,
        },
        events.map(({ event }) => [{ type: 'event' }, event]),
      ] as unknown as Envelope;
      try {
        await transport.send(envelope);
      } catch {
        // Forwarding is best effort; the alert below does not depend on it.
      }
    }
    for (const { event, source } of events)
      await noteBrowserEvent(event as Parameters<typeof noteBrowserEvent>[0], source);
  });

  return Response.json({}, { status: 200, headers });
}
