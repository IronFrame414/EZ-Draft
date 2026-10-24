// EZD-024 Step 5 (vault/plans/EZD-024.md): one capture call for the server. Imports nothing from email/, so
// email/send.ts can import it without a cycle. Returns the Sentry event id, or null when no client exists
// (Sentry off, Step 1).
import * as Sentry from '@sentry/nextjs';

export type CaptureContext = { source: string; location: string; tags?: Record<string, string> };

export function captureToSentry(error: unknown, ctx: CaptureContext): string | null {
  try {
    if (!Sentry.getClient()) return null;
    let eventId: string | null = null;
    Sentry.withScope((scope) => {
      scope.setTags({ ...ctx.tags, 'ezd.source': ctx.source, 'ezd.location': ctx.location });
      eventId = Sentry.captureException(error);
    });
    return eventId;
  } catch {
    return null;
  }
}
