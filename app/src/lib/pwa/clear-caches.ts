// EZD-134 (security: cached pages hold the signed-in person's data): sign-out deletes every cache this app made.
// The device database (queued edits, Q-0503) is never touched. Never throws.
import { CACHE_PREFIX } from './sw-constants.mjs';

export async function clearAppCaches(
  store: Pick<CacheStorage, 'keys' | 'delete'> | undefined = typeof caches === 'undefined'
    ? undefined
    : caches,
): Promise<number> {
  if (!store) return 0;
  try {
    const names = (await store.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
    await Promise.all(names.map((n) => store.delete(n)));
    return names.length;
  } catch {
    return 0;
  }
}
