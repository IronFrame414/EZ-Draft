// EZD-125 (Q-0697 decisions 03, 04; 04:90; AC-EZD-125-4, -8): what the editor needs from the lock routes at
// open, in the editor's first download (11 Budgets: 500,000 compressed bytes), so it is kept this small: the
// acquire at open, answering the epoch when the caller holds the lock and null otherwise (held by another
// person, refused or no answer: the editor opens view only). The full client is lock-client.ts.
export async function acquireAtOpen(
  projectId: string,
  deviceId: string,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  try {
    const res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/lock`, {
      // No content type: the route reads the body text as JSON (lock-route.ts readBody).
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
    const epoch: unknown = res.status === 200 ? (await res.json()).lock.lockEpoch : null;
    return typeof epoch === 'number' ? epoch : null;
  } catch {
    return null;
  }
}
