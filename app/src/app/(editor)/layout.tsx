// EZD-020 Step 1 (vault/plans/EZD-020.md): the editor entry point (11 Performance rule 7).
// EZD-1711 (Q-0795): the billing banner above the editor while a company has days of view and export left (or a
// failed payment, or a trial). A locked company never reaches here (the request gate sends it to /).
import type { ReactNode } from 'react';
import { BillingNotice } from '../../server/billing/billing-text';
import { getBillingState } from '../../server/billing/state';

export default async function EditorLayout({ children }: { children: ReactNode }) {
  const billing = await getBillingState();
  return (
    <div data-entry="editor" style={{ display: 'contents' }}>
      <BillingNotice state={billing} />
      {children}
    </div>
  );
}
