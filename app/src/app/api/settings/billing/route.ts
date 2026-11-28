// EZD-1711 (AC-EZD-1711-2; Q-0237; 13b R2): the company's billing state for Settings > Billing. 404 when billing is
// off or the company is not billed (Worth Properties); 401; 403 without Company settings (server/billing/routes.ts).
// The plan's dollar amounts are what the company pays, so they come only with See company costs (R2).
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { BILLING_HEADERS, billingFail, startBillingRoute } from '../../../../server/billing/routes';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { PLAN } from '../../../../lib/billing/plan';
import { requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/settings/billing';

export async function GET(): Promise<Response> {
  try {
    const r = await startBillingRoute();
    if (r instanceof Response) return r;
    const permitted = await requireApiPermission('settings_company');
    if (permitted instanceof Response) return permitted;
    const { state } = r;
    const seeCosts = permitted.ctx.permissions.has('see_company_costs');
    return Response.json(
      {
        billing: {
          mode: state.mode,
          status: state.status,
          daysLeft: state.daysLeft,
          trialEndsAt: state.trialEndsAt,
          currentPeriodEnd: state.currentPeriodEnd,
          hasSubscription: state.hasSubscription,
          plan: seeCosts
            ? {
                monthlyDollars: PLAN.monthlyDollars,
                includedOfficeUsers: PLAN.includedOfficeUsers,
                extraOfficeUserDollars: PLAN.extraOfficeUserDollars,
              }
            : null,
        },
      },
      { status: 200, headers: BILLING_HEADERS },
    );
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return billingFail(500, 'db_unavailable');
  }
}
