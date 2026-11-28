// EZD-1711 (AC-EZD-1711-1, -3; vault/build/assumptions/EZD-1711.md Settled "Webhook"): Stripe's webhook. Public (no
// session; Stripe posts from outside, so it is a same-origin exception) and trusted only by its signature. Order:
// 404 when billing is off; 400 invalid_signature for a missing or bad Stripe-Signature over the raw body; then the
// event is applied once (billing_apply_subscription, secret-key client) and answered 200 { received: true }, also
// for a duplicate, stale, unknown-customer or ignored event, so Stripe stops retrying. A database failure is 500
// after reportRouteFailure, so Stripe retries it.
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { billingConfig } from '../../../../server/billing/config';
import { stripeBilling } from '../../../../server/billing/stripe';
import { applyStripeEvent, verifyStripeEvent } from '../../../../server/billing/webhook';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { createJobsDbClient } from '../../../../server/jobs/db';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/billing/stripe-webhook';
const headers = { 'Cache-Control': 'no-store' };

const fail = (status: number, code: string) =>
  Response.json({ error: { code, message_key: `error.${code}` } }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  const config = billingConfig();
  if (config === null) return fail(404, 'billing_not_found');
  let body: string;
  try {
    body = await request.text();
  } catch {
    return fail(400, 'invalid_signature');
  }
  const event = verifyStripeEvent(body, request.headers.get('stripe-signature'), config.webhookSecret);
  if (event === null) return fail(400, 'invalid_signature');
  try {
    await applyStripeEvent(createJobsDbClient(), event, stripeBilling(config));
    return Response.json({ received: true }, { status: 200, headers });
  } catch (e) {
    // The route has no member session; the shared route rule still runs first (EZD-421).
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
