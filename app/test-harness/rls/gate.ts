// EZD-006 Step 7 (vault/plans/EZD-006.md; Q-0087 (ii)): the `public` RPCs that `anon` or `authenticated`
// may execute. T22 (c) calls each without the gate header and expects 42501; T22 (j) fails when the
// catalog holds a callable `public` function that is not listed. A ticket that adds such a function
// adds it here in its own commit (EZD-007: current_app_user_id, link_app_user; EZD-009: enqueue_job).
export type GatedRpcCall = { fn: string; args: Record<string, unknown> };

export const GATED_RPC_CALLS: GatedRpcCall[] = [{ fn: 'health', args: {} }];
