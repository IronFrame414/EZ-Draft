// EZD-614 (S09:54 "load calc reads ratings from catalog specs first, then standard defaults"; AC-EZD-614-1 "The calc
// uses the default when an item has no rating"): the browser's copy of the company's appliance rating defaults, as the
// load calc takes them (VA by appliance type). Every place the calc runs in the browser reads it: the electrical status
// bar, Add to E2.0 and the Sheets issue checklist and issue. Read from GET /api/settings/appliance-ratings (any member
// of the company); until it answers, or when it fails, the map is empty and an unrated item stays the calc error.
import { useEffect, useSyncExternalStore } from 'react';
import { defaultsVaMap, type ApplianceRating } from './ratings';

export type ApplianceDefaults = Readonly<Record<string, number>>;

export type ApplianceDefaultsSource = {
  get(): ApplianceDefaults;
  subscribe(listener: () => void): () => void;
  /** Reads the list again (one read at a time); resolves to the map, the last one known on a failed read. */
  load(): Promise<ApplianceDefaults>;
  /** The list a save answered with (Settings > Catalog). */
  set(rows: readonly ApplianceRating[]): void;
};

export const APPLIANCE_RATINGS_URL = '/api/settings/appliance-ratings';
const EMPTY: ApplianceDefaults = Object.freeze({});

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createApplianceDefaults(fetchImpl: Fetch): ApplianceDefaultsSource {
  let current: ApplianceDefaults = EMPTY;
  let reading: Promise<ApplianceDefaults> | null = null;
  const listeners = new Set<() => void>();
  const put = (next: ApplianceDefaults) => {
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    for (const l of listeners) l();
  };
  const set = (rows: readonly ApplianceRating[]) => put(Object.freeze(defaultsVaMap(rows)));
  const read = async (): Promise<ApplianceDefaults> => {
    try {
      const res = await fetchImpl(APPLIANCE_RATINGS_URL, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) return current;
      const body = (await res.json()) as { rows?: unknown };
      if (Array.isArray(body.rows)) set(body.rows as ApplianceRating[]);
    } catch {
      /* the last map known stays */
    }
    return current;
  };
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      reading ??= read().finally(() => {
        reading = null;
      });
      return reading;
    },
    set,
  };
}

/** The page's one copy (the editor and the Settings card share it). */
export const sharedApplianceDefaults: ApplianceDefaultsSource = createApplianceDefaults(
  (input, init) => fetch(input, init),
);

/** The defaults map, read again each time a component using it mounts. */
export function useApplianceDefaults(
  source: ApplianceDefaultsSource = sharedApplianceDefaults,
): ApplianceDefaults {
  useEffect(() => {
    void source.load();
  }, [source]);
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}
