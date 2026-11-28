// EZD-1711 (Q-0795; wording rows in vault/build/assumptions/EZD-1711.md): the billing banner and the paywall for the
// office and editor layouts, with their English text resolved on the server (office screens are English only,
// Q-0121), so a page sends no extra messages (CLAUDE.md rule 11).
import 'server-only';
import { BillingBanner } from '../../components/billing/BillingBanner';
import { Paywall } from '../../components/billing/Paywall';
import { SignOutButton } from '../../components/auth/SignOutButton';
import { billingNotice, type BillingState } from '../../lib/billing/plan';
import { MessagesProvider } from '../../lib/messages';
import { createT } from '../../lib/messages/t';
import type { Message } from '../../lib/messages/types';
import { catalogFor, type MessageKey } from '../messages/catalog';
import { can, getPermissionContext } from '../permissions';

function officeT() {
  return createT('en', catalogFor('office', 'en') as Readonly<Record<MessageKey, Message>>);
}

export function BillingNotice({ state }: { state: BillingState | null }) {
  const notice = billingNotice(state);
  if (notice === null) return null;
  const t = officeT();
  if (notice.kind === 'grace') {
    return (
      <BillingBanner
        kind="grace"
        text={t('office.billing.grace', { count: notice.daysLeft })}
      />
    );
  }
  if (notice.kind === 'past_due') {
    return <BillingBanner kind="past_due" text={t('office.billing.past_due')} />;
  }
  return (
    <BillingBanner
      kind="trial"
      text={t('office.billing.trial', { count: notice.daysLeft })}
    />
  );
}

export function isLocked(state: BillingState | null): boolean {
  return state !== null && state.applies && state.mode === 'locked';
}

/** The paywall; "Pay now" only with the Company settings switch (Settled "Who manages billing"). */
export async function BillingPaywall() {
  let canPay = false;
  try {
    canPay = can(await getPermissionContext(), 'settings_company');
  } catch {
    canPay = false;
  }
  const t = officeT();
  const signOutKey: MessageKey = 'common.sign_in.sign_out';
  return (
    <Paywall
      title={t('office.billing.paywall_title')}
      body={t('office.billing.paywall_body')}
      payNow={
        canPay
          ? { label: t('office.billing.pay_now'), errorText: t('error.billing_unavailable') }
          : null
      }
      askOwner={t('office.billing.ask_owner')}
      signOut={
        <MessagesProvider language="en" messages={{ [signOutKey]: t(signOutKey) }}>
          <SignOutButton />
        </MessagesProvider>
      }
    />
  );
}
