// EZD-1711 (AC-EZD-1711-1, AC-EZD-1711-3; Q-0795): what the request gate (proxy.ts) does with a signed-in request
// for the company's billing mode. Pure, so it is tested without a server.
//  full:   everything passes.
//  grace:  the 14 days after a company stops paying. Pages and reads pass (open and export); a write to /api is
//          refused 403 billing_read_only (no edit, create, render or send) unless it is on GRACE_WRITES: paying,
//          exporting, viewing (recent list, realtime token, opening a notification), the member's own profile
//          and error reports. The editor's lock request is refused, so it opens view only (lib/lock/lock-open.ts).
//  locked: after the 14 days only the paywall shows. A page other than Projects (/) is sent to /, where the
//          office layout shows the paywall in place of the page; /api answers 403 billing_inactive except the
//          billing routes (so Pay now works) and error reports. Server actions (sign-out) pass.
import { isApiPath, isSafeMethod } from '../auth/same-origin';
import type { BillingMode } from '../../lib/billing/plan';

export type BillingDecision =
  | { kind: 'pass' }
  | { kind: 'refuse'; code: 'billing_read_only' | 'billing_inactive' }
  | { kind: 'redirect'; to: '/' };

const ID = '[^/]+';

/** Billing routes: paying again must always work. */
const BILLING_ROUTES = [/^\/api\/settings\/billing(?:\/.*)?$/, /^\/api\/billing(?:\/.*)?$/];

/** Error reports, the health probe, and the client link lookup (its answer already follows the company's mode:
 * active in the 14 days, unavailable after them, in resolve_share_link). */
const ALWAYS = [/^\/api\/monitoring$/, /^\/api\/health$/, /^\/api\/share-links\/resolve$/];

/** Writes that only view, export or touch the member's own account (Q-0795 "open and export"). */
const GRACE_WRITES = [
  new RegExp(`^/api/projects/${ID}/exports$`),
  /^\/api\/projects\/recent$/,
  /^\/api\/realtime\/token$/,
  /^\/api\/notifications(?:\/.*)?$/,
  /^\/api\/profile(?:\/.*)?$/,
  new RegExp(`^/api/projects/${ID}/lock/release$`),
];

/** The pages a signed-out or paying-again user still needs. */
const LOCKED_PAGES = [/^\/$/, /^\/sign-in(?:\/.*)?$/, /^\/auth(?:\/.*)?$/, /^\/terms(?:\/.*)?$/];

function folded(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const f = decoded.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
  return f.length > 1 && f.endsWith('/') ? f.slice(0, -1) : f;
}

const matches = (list: readonly RegExp[], path: string) => list.some((r) => r.test(path));

/** Paths the gate never asks the database about (billing routes, error reports, sign-in pages). */
export function billingSkips(pathname: string): boolean {
  const p = folded(pathname);
  return matches(BILLING_ROUTES, p) || matches(ALWAYS, p) || (p !== '/' && matches(LOCKED_PAGES, p));
}

export function billingDecision(mode: BillingMode, method: string, pathname: string): BillingDecision {
  if (mode === 'full') return { kind: 'pass' };
  const p = folded(pathname);
  if (matches(BILLING_ROUTES, p) || matches(ALWAYS, p)) return { kind: 'pass' };
  const api = isApiPath(pathname);
  if (mode === 'grace') {
    if (!api || isSafeMethod(method) || matches(GRACE_WRITES, p)) return { kind: 'pass' };
    return { kind: 'refuse', code: 'billing_read_only' };
  }
  if (api) return { kind: 'refuse', code: 'billing_inactive' };
  if (!isSafeMethod(method)) return { kind: 'pass' };
  if (matches(LOCKED_PAGES, p)) return { kind: 'pass' };
  return { kind: 'redirect', to: '/' };
}
