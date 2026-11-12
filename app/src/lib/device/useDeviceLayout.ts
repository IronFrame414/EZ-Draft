// The device layout as a React hook (vault/plans/EZD-014a.md Step 2).
// EZD-208b Build step 4 (vault/plans/EZD-208b.md section 3 C5, C6; DB6, DB18; Q-0633 G9): the coarse-pointer query as
// a store and a hook; true means a tablet.
import { useSyncExternalStore } from 'react';
import {
  COARSE_POINTER_QUERY,
  getDeviceLayout,
  subscribeDeviceLayout,
  type DeviceLayout,
  type MatchMedia,
} from './device-layout';

const browserMatchMedia: MatchMedia = (q) => window.matchMedia(q);

export const deviceLayoutStore: {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): DeviceLayout;
  getServerSnapshot(): DeviceLayout;
} = {
  subscribe: (onChange) => subscribeDeviceLayout(browserMatchMedia, onChange),
  getSnapshot: () => getDeviceLayout(browserMatchMedia),
  getServerSnapshot: () => 'full',
};

export function useDeviceLayout(): DeviceLayout {
  return useSyncExternalStore(
    deviceLayoutStore.subscribe,
    deviceLayoutStore.getSnapshot,
    deviceLayoutStore.getServerSnapshot,
  );
}

export const coarsePointerStore: {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): boolean;
  getServerSnapshot(): boolean;
} = {
  subscribe: (onChange) => {
    const list = window.matchMedia(COARSE_POINTER_QUERY);
    const handler = () => onChange();
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  },
  getSnapshot: () => window.matchMedia(COARSE_POINTER_QUERY).matches,
  getServerSnapshot: () => false,
};

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    coarsePointerStore.subscribe,
    coarsePointerStore.getSnapshot,
    coarsePointerStore.getServerSnapshot,
  );
}
