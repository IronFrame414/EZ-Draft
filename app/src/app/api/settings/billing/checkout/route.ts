// EZD-1711 (AC-EZD-1711-2, -3; Q-0236): POST answers 200 { url } for "Add a card" and "Pay now": a Stripe-hosted
// Checkout that adds a card (trialing, active, paused), a Checkout for a new subscription after the old one
// ended (canceled, incomplete_expired), or the customer portal where an unpaid or past-due invoice is paid
// (Settled "Card data": card data never reaches EZ Draft).
// 404 when billing is off or the company is not billed (Worth Properties); 401; 403 without Company settings
// (server/billing/routes.ts). Allowed in every billing mode, so a company can always pay again.
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import {
  BILLING_HEADERS,
  billingFail,
  billingReturnUrl,
  startBillingRoute,
} from '../../../../../server/billing/routes';
import { loadStripeCustomer } from '../../../../../server/billing/state';
import { stripeBilling } from '../../../../../server/billing/stripe';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/billing/checkout';

export async function POST(request: Request): Promise<Response> {
  try {
    const r = await startBillingRoute();
    if (r instanceof Response) return r;
    const permitted = await requireApiPermission('settings_company');
    if (permitted instanceof Response) return permitted;
    const customer = await loadStripeCustomer(r.client);
    if (customer === null) return billingFail(404, 'billing_not_found');
    const stripe = stripeBilling(r.config);
    const returnUrl = billingReturnUrl(request);
    const status = r.state.status;
    const url =
      status === 'unpaid' || status === 'past_due'
        ? await stripe.portalUrl({ customer, returnUrl })
        : await stripe.checkoutUrl({
            customer,
            returnUrl,
            kind: status === 'canceled' || status === 'incomplete_expired' ? 'subscribe' : 'setup',
          });
    return Response.json({ url }, { status: 200, headers: BILLING_HEADERS });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return billingFail(500, 'billing_unavailable');
  }
}
