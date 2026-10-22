// The device layout as a React hook (vault/plans/EZD-014a.md Step 2).
import { useSyncExternalStore } from 'react';
import {
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
