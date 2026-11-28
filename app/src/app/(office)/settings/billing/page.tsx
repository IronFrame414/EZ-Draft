// EZD-1711 (AC-EZD-1711-2; Q-0220, Q-0237; Settled "Who manages billing"): Settings > Billing. Not found when billing
// is off or the company is not billed (Worth Properties, billing exempt); without the Company settings switch the
// no-access line in place; otherwise the billing panel, with the plan's dollar amounts only for See company costs.
// This static folder takes precedence over [section].
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { BillingPanel } from '../../../../components/settings/billing/BillingPanel';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import { requireSession } from '../../../../server/auth/session';
import { getBillingState } from '../../../../server/billing/state';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const [ctx, state] = await Promise.all([settingsPermissionContext(), getBillingState()]);
  if (state === null || !state.applies) notFound();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_company')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  return (
    <SettingsMain
      section="billing"
      title="office.billing.section"
      subtitle="office.billing.subtitle"
    >
      <BillingPanel state={state} showPlan={can(ctx, 'see_company_costs')} />
    </SettingsMain>
  );
}
