// EZD-1906a (editor plan R3): one hook for reading a store the page may not have yet, in place of
// `useSyncExternalStore(store ? store.subscribe : noSubscribe, ...)` at each reader.
import { useSyncExternalStore } from 'react';

type Subscribable = { subscribe(listener: () => void): () => void };

// One function for every reader without a store, so React does not resubscribe on each render.
const noSubscribe = () => () => {};

/**
 * The value `select` reads from `store`, kept current; `fallback` while there is no store. `select` must return the
 * store's own value (the same reference until it changes), never a new object, or React renders without end.
 */
export function useStoreValue<S extends Subscribable, T>(
  store: S | null | undefined,
  select: (store: S) => T,
  fallback: T,
): T {
  const read = () => (store ? select(store) : fallback);
  return useSyncExternalStore(store ? store.subscribe : noSubscribe, read, read);
}
