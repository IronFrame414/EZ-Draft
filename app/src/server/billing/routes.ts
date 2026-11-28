// EZD-1711 (AC-EZD-1711-2; vault/build/assumptions/EZD-1711.md Settled "Who manages billing"): the shared start of
// every Settings > Billing route. Order: 404 when billing is off; 401 without a session; 404 for a company that is
// not billed (Worth Properties, billing exempt, or no billing account), so tenant 1 gets not found from every
// billing route whoever asks. Each route then calls requireApiPermission('settings_company') itself (403).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingState } from '../../lib/billing/plan';
import { requireApiSession } from '../auth/session';
import { createSessionClient } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { billingConfig, type BillingConfig } from './config';
import { loadBillingState } from './state';

export const BILLING_HEADERS = { 'Cache-Control': 'no-store' };

export const billingFail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers: BILLING_HEADERS });

export type BillingRoute = {
  config: BillingConfig;
  client: SupabaseClient<Database>;
  state: Extract<BillingState, { applies: true }>;
};

export async function startBillingRoute(): Promise<BillingRoute | Response> {
  const config = billingConfig();
  if (config === null) return billingFail(404, 'billing_not_found');
  const session = await requireApiSession();
  if (session instanceof Response) return session;
  const client = createSessionClient();
  const state = await loadBillingState(client);
  if (!state.applies) return billingFail(404, 'billing_not_found');
  return { config, client, state };
}

/**
 * Return address for Checkout and the portal: the browser's own origin (the request gate already refused a write
 * whose Origin is not this site), else the request URL's origin, which behind a proxy can name another host.
 */
export function billingReturnUrl(request: Request): string {
  const origin = request.headers.get('origin');
  const base = origin !== null && /^https?:\/\/[^/]+$/.test(origin) ? origin : new URL(request.url).origin;
  return `${base}/settings/billing`;
}
