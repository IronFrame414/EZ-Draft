// EZD-706 (S13 Data shown "symbol key ("SYMBOLS USED ON THIS SHEET")"; S13 Validation "Key: only symbols and
// abbreviations actually used; updates when objects are added or removed; placement per set"; S15h Tab: Symbols +
// abbreviations "Full symbol and abbreviation library ... Read-only system set"; AC-EZD-706-1; vault/build/assumptions.md
// EZD-706): the system symbol and abbreviation library, and the symbols a set of model objects uses, in library
// order. Labels are sheet text, English only (S13 Decision 7), so they are not catalog messages. No DOM.
import {
  DEVICE_KINDS,
  FIXTURE_KINDS,
  HVAC_KINDS,
  ACCESS_KINDS,
  OBJECT_STATUSES,
  hasLevel,
  type ModelObject,
} from '../schema';

// How a key row draws its mark (the sheet draws it in a small swatch beside the label).
export type SymbolGlyph =
  | { kind: 'wall'; status: (typeof OBJECT_STATUSES)[number] }
  | { kind: 'door' }
  | { kind: 'window' }
  | { kind: 'outline' }
  | { kind: 'register'; diagonals: 1 | 2 }
  | { kind: 'hatch' }
  | { kind: 'circle'; text: string | null }
  | { kind: 'duplex' }
  | { kind: 'fan' }
  | { kind: 'diamond' }
  | { kind: 'keynote' }
  | { kind: 'delta' };

export type SymbolGroup =
  | 'walls'
  | 'doors'
  | 'windows'
  | 'plumbing'
  | 'electrical'
  | 'low_voltage'
  | 'hvac'
  | 'ceiling'
  | 'markers';

export type SystemSymbol = { id: string; group: SymbolGroup; label: string; glyph: SymbolGlyph };

const WALL_LABEL = {
  existing: 'Existing wall to remain',
  demo: 'Existing wall to be removed',
  new: 'New wall',
} as const;

const FIXTURE_LABEL: Record<(typeof FIXTURE_KINDS)[number], string> = {
  toilet: 'Toilet',
  lavatory: 'Lavatory',
  tub: 'Tub',
  shower_prefab: 'Shower, prefab',
  sink: 'Sink',
  cooktop: 'Cooktop',
  range: 'Range',
  hood: 'Hood',
  refrigerator: 'Refrigerator',
  dishwasher: 'Dishwasher',
  disposal: 'Disposal',
  washer: 'Washer',
  dryer: 'Dryer',
  water_heater: 'Water heater',
};

// The letters inside a device's circle are the plan's (app/src/lazy/room-fields/details-drawing.ts DETECTOR_TEXT;
// a test keeps the two the same).
export const DEVICE_KEY_TEXT = {
  smoke_detector: 'SD',
  co_detector: 'CO',
  smoke_co_detector: 'S/CO',
  speaker: 'SPK',
  camera: 'CAM',
  wifi_ap: 'WAP',
  receptacle_240v: '240',
  switch_single: 'S',
  switch_3way: 'S3',
  switch_dimmer: 'SDM',
  data: 'D',
  tv: 'TV',
  doorbell: 'DB',
} as const;

const DEVICE_LABEL: Record<(typeof DEVICE_KINDS)[number], string> = {
  smoke_detector: 'Smoke detector',
  co_detector: 'CO detector',
  smoke_co_detector: 'Smoke/CO detector',
  recessed_light: 'Recessed light',
  ceiling_fan: 'Ceiling fan',
  speaker: 'Speaker',
  camera: 'Camera',
  wifi_ap: 'Wi-Fi access point',
  receptacle_duplex: 'Duplex receptacle',
  receptacle_240v: '240V receptacle',
  switch_single: 'Switch',
  switch_3way: '3-way switch',
  switch_dimmer: 'Dimmer switch',
  data: 'Data outlet',
  tv: 'TV outlet',
  doorbell: 'Doorbell',
};

const DEVICE_GROUP: Record<(typeof DEVICE_KINDS)[number], SymbolGroup> = {
  smoke_detector: 'ceiling',
  co_detector: 'ceiling',
  smoke_co_detector: 'ceiling',
  recessed_light: 'ceiling',
  ceiling_fan: 'ceiling',
  speaker: 'low_voltage',
  camera: 'low_voltage',
  wifi_ap: 'low_voltage',
  receptacle_duplex: 'electrical',
  receptacle_240v: 'electrical',
  switch_single: 'electrical',
  switch_3way: 'electrical',
  switch_dimmer: 'electrical',
  data: 'low_voltage',
  tv: 'low_voltage',
  doorbell: 'low_voltage',
};

const HVAC_LABEL: Record<(typeof HVAC_KINDS)[number], string> = {
  supply: 'Supply register',
  return: 'Return register',
  air_handler: 'Air handler',
  condenser: 'Condenser',
};

const ACCESS_LABEL: Record<(typeof ACCESS_KINDS)[number], string> = {
  attic_hatch: 'Attic access',
  access_panel: 'Access panel',
};

function deviceGlyph(kind: (typeof DEVICE_KINDS)[number]): SymbolGlyph {
  if (kind === 'receptacle_duplex') return { kind: 'duplex' };
  if (kind === 'ceiling_fan') return { kind: 'fan' };
  if (kind === 'recessed_light') return { kind: 'circle', text: null };
  return { kind: 'circle', text: DEVICE_KEY_TEXT[kind] };
}

const hvacGlyph = (kind: (typeof HVAC_KINDS)[number]): SymbolGlyph =>
  kind === 'supply'
    ? { kind: 'register', diagonals: 2 }
    : kind === 'return'
      ? { kind: 'register', diagonals: 1 }
      : { kind: 'outline' };

// The read-only system set, in the order a key lists it.
export const SYSTEM_SYMBOLS: readonly SystemSymbol[] = [
  ...OBJECT_STATUSES.map(
    (status): SystemSymbol => ({
      id: `wall.${status}`,
      group: 'walls',
      label: WALL_LABEL[status],
      glyph: { kind: 'wall', status },
    }),
  ),
  { id: 'opening.door', group: 'doors', label: 'Door', glyph: { kind: 'door' } },
  { id: 'opening.window', group: 'windows', label: 'Window', glyph: { kind: 'window' } },
  ...FIXTURE_KINDS.map(
    (k): SystemSymbol => ({ id: `fixture.${k}`, group: 'plumbing', label: FIXTURE_LABEL[k], glyph: { kind: 'outline' } }),
  ),
  { id: 'tile_shower', group: 'plumbing', label: 'Tile shower', glyph: { kind: 'outline' } },
  { id: 'utility_point', group: 'plumbing', label: 'Utility point', glyph: { kind: 'diamond' } },
  { id: 'blocking', group: 'walls', label: 'Grab-bar blocking', glyph: { kind: 'register', diagonals: 2 } },
  { id: 'panel', group: 'electrical', label: 'Electrical panel', glyph: { kind: 'hatch' } },
  ...DEVICE_KINDS.filter((k) => DEVICE_GROUP[k] !== 'ceiling').map(
    (k): SystemSymbol => ({ id: `device.${k}`, group: DEVICE_GROUP[k], label: DEVICE_LABEL[k], glyph: deviceGlyph(k) }),
  ),
  ...HVAC_KINDS.map(
    (k): SystemSymbol => ({ id: `hvac.${k}`, group: 'hvac', label: HVAC_LABEL[k], glyph: hvacGlyph(k) }),
  ),
  ...DEVICE_KINDS.filter((k) => DEVICE_GROUP[k] === 'ceiling').map(
    (k): SystemSymbol => ({ id: `device.${k}`, group: 'ceiling', label: DEVICE_LABEL[k], glyph: deviceGlyph(k) }),
  ),
  ...ACCESS_KINDS.map(
    (k): SystemSymbol => ({ id: `access.${k}`, group: 'ceiling', label: ACCESS_LABEL[k], glyph: { kind: 'register', diagonals: 2 } }),
  ),
  { id: 'soffit', group: 'ceiling', label: 'Soffit', glyph: { kind: 'outline' } },
  { id: 'chase', group: 'ceiling', label: 'Chase', glyph: { kind: 'outline' } },
  { id: 'beam', group: 'ceiling', label: 'Beam', glyph: { kind: 'outline' } },
  { id: 'keynote', group: 'markers', label: 'Keynote', glyph: { kind: 'keynote' } },
  { id: 'revision', group: 'markers', label: 'Revision cloud + delta', glyph: { kind: 'delta' } },
];

const BY_ID: ReadonlyMap<string, SystemSymbol> = new Map(SYSTEM_SYMBOLS.map((s) => [s.id, s]));
const ORDER: ReadonlyMap<string, number> = new Map(SYSTEM_SYMBOLS.map((s, i) => [s.id, i]));

// The system abbreviations: the ones EZ Draft prints on sheets (vault/build/assumptions.md EZD-706). A company adds
// its own on the S15h tab.
export const SYSTEM_ABBREVIATIONS: readonly { name: string; meaning: string }[] = [
  { name: 'AFF', meaning: 'Above finished floor' },
  { name: 'CLR', meaning: 'Clear' },
  { name: 'EQ', meaning: 'Equal' },
  { name: 'EXIST', meaning: 'Existing' },
  { name: 'NEW', meaning: 'New' },
  { name: 'NTS', meaning: 'Not to scale' },
  { name: 'TYP', meaning: 'Typical' },
  { name: 'UNO', meaning: 'Unless noted otherwise' },
];

// The system symbol an object draws with, or null for a type the key does not list.
export function symbolIdOf(o: ModelObject): string | null {
  switch (o.type) {
    case 'wall':
      return `wall.${o.data.status}`;
    case 'opening':
      return `opening.${o.data.attributes.kind}`;
    case 'fixture':
      return `fixture.${o.data.attributes.kind}`;
    case 'device':
      return `device.${o.data.attributes.kind}`;
    case 'hvac':
      return `hvac.${o.data.attributes.kind}`;
    case 'access':
      return `access.${o.data.attributes.kind}`;
    case 'tile_shower':
    case 'utility_point':
    case 'blocking':
    case 'panel':
    case 'soffit':
    case 'chase':
    case 'beam':
      return o.type;
    default:
      return null;
  }
}

// The symbols the objects use, once each, in library order. With `level`, only the objects on that floor (ids
// compared without case, as the floors are).
export function usedSymbols(objects: readonly ModelObject[], level?: string | null): SystemSymbol[] {
  const used = new Set<string>();
  const want = level == null ? null : level.toLowerCase();
  for (const o of objects) {
    if (want !== null && (!hasLevel(o) || o.data.level.toLowerCase() !== want)) continue;
    const id = symbolIdOf(o);
    if (id !== null && BY_ID.has(id)) used.add(id);
  }
  return [...used].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!).map((id) => BY_ID.get(id)!);
}
