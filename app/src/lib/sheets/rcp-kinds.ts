// EZD-507, EZD-708a: which objects sit on the ceiling, so are drawn on the RCP (editor/ceiling/rcp-list.ts) and keyed on
// its sheet (A6.0, lazy/sheets-screen/sheet-key.ts). Kept apart from rcp-list.ts so the Sheets screen reads it without the
// drawing code.

/** EZD-507: the device kinds that sit on the ceiling. */
export const RCP_DEVICE_KINDS: ReadonlySet<string> = new Set([
  'recessed_light',
  'ceiling_fan',
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'speaker',
  'camera',
  'wifi_ap',
]);

/** EZD-708a (Q-0780): the hvac kinds that sit on the ceiling (supply and return registers). */
export const RCP_HVAC_KINDS: ReadonlySet<string> = new Set(['supply', 'return']);

const RCP_TYPES: ReadonlySet<string> = new Set(['wall', 'room', 'access']);

/** Whether an object of this type and data is drawn from the floor list onto the RCP. */
export function onRcp(type: string, data: unknown): boolean {
  if (RCP_TYPES.has(type)) return true;
  if (type !== 'device' && type !== 'hvac') return false;
  const kind = (data as { attributes?: { kind?: unknown } } | null)?.attributes?.kind;
  if (typeof kind !== 'string') return false;
  return type === 'device' ? RCP_DEVICE_KINDS.has(kind) : RCP_HVAC_KINDS.has(kind);
}

/** EZD-708a: whether the RCP shows an object, its own items or ones it adds (beams). */
export function shownOnRcp(type: string, data: unknown): boolean {
  return type === 'beam' || onRcp(type, data);
}
