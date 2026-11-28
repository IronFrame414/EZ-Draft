'use client';
// EZD-1711 (Q-0236): "Add a card", "Manage billing" and "Pay now". POSTs the billing route and goes to the
// Stripe-hosted page it answers; card data never reaches EZ Draft. A refused or failed call shows the error text.
import { useState } from 'react';
import { StateButton } from '../states/StateButton';

export type BillingButtonProps = {
  endpoint: '/api/settings/billing/checkout' | '/api/settings/billing/portal';
  label: string;
  errorText: string;
  primary?: boolean;
};

export function BillingButton({ endpoint, label, errorText, primary }: BillingButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const onClick = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const body: unknown = res.ok ? await res.json() : null;
      const url = (body as { url?: unknown } | null)?.url;
      if (typeof url === 'string' && url !== '') {
        window.location.assign(url);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };
  return (
    <span>
      <StateButton
        variant={primary ? 'primary' : 'secondary'}
        disabled={busy}
        onClick={() => void onClick()}
        data-billing-action={endpoint.endsWith('checkout') ? 'checkout' : 'portal'}
      >
        {label}
      </StateButton>
      {failed ? (
        <span role="alert" data-billing-error="">
          {' '}
          {errorText}
        </span>
      ) : null}
    </span>
  );
}
