// EZD-602 (S06 Controls Device toolbar rows; phase-06 EZD-602 "low voltage (data, TV, doorbell, speakers, cameras,
// Wi-Fi APs)"; vault/build/assumptions.md EZD-602): the toolbar's items and each item's kinds, the first its starting
// choice (DEVICE_KINDS of the geometry schema). Read only by electrical mode's lazy module (11 Budgets).

export const DEVICE_TOOLBAR_ITEMS = [
  'receptacle',
  'switch',
  'light',
  'low-voltage',
  'detector',
  'fan',
] as const;
export type DeviceToolbarItem = (typeof DEVICE_TOOLBAR_ITEMS)[number];

export const TOOLBAR_KINDS: Readonly<Record<DeviceToolbarItem, readonly string[]>> = {
  receptacle: ['receptacle_duplex', 'receptacle_240v'],
  switch: ['switch_single', 'switch_3way', 'switch_dimmer'],
  light: ['recessed_light'],
  'low-voltage': ['data', 'tv', 'doorbell', 'speaker', 'camera', 'wifi_ap'],
  detector: ['smoke_detector', 'co_detector', 'smoke_co_detector'],
  fan: ['ceiling_fan'],
};

/** The kind the item places next: the page's choice, else the item's first kind. */
export const chosenKind = (
  kinds: Readonly<Partial<Record<string, string>>>,
  item: DeviceToolbarItem,
) => kinds[item] ?? TOOLBAR_KINDS[item][0]!;
