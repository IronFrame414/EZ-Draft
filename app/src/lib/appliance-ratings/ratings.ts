// EZD-614 (S15e Controls "Appliance rating defaults | Fallback ratings (volts, amps or VA) per appliance type when a
// catalog item lacks specs | Owner enters (Round 24)"; S09:54 "load calc reads ratings from catalog specs first, then
// standard defaults"; Q-0766; assumptions EZD-614): the company's appliance rating defaults as the Settings card edits
// them and as the load calc reads them. Pure: no DOM, no server.

/**
 * The appliance types a default can be entered for: the ids the load calc looks a default up by (existing-panel.ts
 * dwellingLoads: the EZD-234 appliance fixture kinds and the panel's existing `ac`), plus microwave and wall oven
 * (assumptions EZD-614 "Appliance types"; EZD-665). In the order the Add list offers them.
 */
export const APPLIANCE_TYPES = [
  'range',
  'cooktop',
  'wall_oven',
  'microwave',
  'hood',
  'dishwasher',
  'disposal',
  'refrigerator',
  'washer',
  'dryer',
  'water_heater',
  'ac',
] as const;
export type ApplianceType = (typeof APPLIANCE_TYPES)[number];

/** Volts are 120 or 240 (09b:35; Q-0704; 09s Rules). */
export const APPLIANCE_VOLTS = [120, 240] as const;
export const APPLIANCE_NAME_MAX = 80;
/** The amps column holds up to 1,000 A in hundredths (migration appliance_rating_default). */
export const APPLIANCE_AMPS_MAX = 1000;
export const APPLIANCE_ROWS_MAX = 200;

export type ApplianceRating = {
  /** The id the load calc looks up, e.g. "dishwasher". */
  applianceType: string;
  name: string;
  volts: number;
  amps: number;
};

export function isApplianceType(v: unknown): v is ApplianceType {
  return typeof v === 'string' && (APPLIANCE_TYPES as readonly string[]).includes(v);
}

/** VA = volts x amps (09s Rules), exact to the hundredth amp. */
export function ratingVa(r: Pick<ApplianceRating, 'volts' | 'amps'>): number {
  return (r.volts * Math.round(r.amps * 100)) / 100;
}

/** The load calc's `defaults`: VA by appliance type (packages/geometry electrical/load-calc.ts). */
export function defaultsVaMap(rows: readonly ApplianceRating[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.applianceType] = ratingVa(r);
  return out;
}

/** Amps as typed: a number above 0 and at most 1,000 with at most two decimals; null otherwise. */
export function parseAmps(text: string): number | null {
  const s = text.trim();
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= APPLIANCE_AMPS_MAX ? n : null;
}

function validRow(r: unknown): r is ApplianceRating {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return false;
  const o = r as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 4 || !['applianceType', 'name', 'volts', 'amps'].every((k) => k in o))
    return false;
  return (
    isApplianceType(o.applianceType) &&
    typeof o.name === 'string' &&
    o.name.trim().length > 0 &&
    o.name.length <= APPLIANCE_NAME_MAX &&
    (APPLIANCE_VOLTS as readonly unknown[]).includes(o.volts) &&
    typeof o.amps === 'number' &&
    Number.isFinite(o.amps) &&
    o.amps > 0 &&
    o.amps <= APPLIANCE_AMPS_MAX &&
    Math.abs(o.amps * 100 - Math.round(o.amps * 100)) < 1e-6
  );
}

/** The PUT body `{ rows: ApplianceRating[] }`: every row valid, each type once; null when refused. */
export function parseApplianceRatingsBody(body: unknown): ApplianceRating[] | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).length !== 1 || !Array.isArray(b.rows)) return null;
  if (b.rows.length > APPLIANCE_ROWS_MAX || !b.rows.every(validRow)) return null;
  const rows = b.rows as ApplianceRating[];
  if (new Set(rows.map((r) => r.applianceType)).size !== rows.length) return null;
  return rows.map((r) => ({
    applianceType: r.applianceType,
    name: r.name.trim(),
    volts: r.volts,
    amps: r.amps,
  }));
}

/** Rows in the Add list's order, unknown types last by name. */
export function sortRatings(rows: readonly ApplianceRating[]): ApplianceRating[] {
  const rank = (t: string) => {
    const i = (APPLIANCE_TYPES as readonly string[]).indexOf(t);
    return i < 0 ? APPLIANCE_TYPES.length : i;
  };
  return [...rows].sort(
    (a, b) => rank(a.applianceType) - rank(b.applianceType) || a.name.localeCompare(b.name),
  );
}
