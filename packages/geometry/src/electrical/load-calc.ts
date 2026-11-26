// EZD-607 (09a "Electrical load calculation": "Standard method lines: general lighting by area, small-appliance
// circuits, laundry, demand factors, fixed appliances, dryer, ranges, larger of heating or cooling, total VA, amps at
// 240 V, compare to service rating"; 09a "Load calculation: worked example"; vault/build/assumptions.md EZD-607): the
// NEC Article 220 standard method as a pure function. It returns every line of the math in order, so E2.0 and the
// load calc inspector (EZD-608) print it line by line. Shared code: the browser runs it while the calc is on screen,
// the server re-runs it at send or issue (13b R8; 13a P3). Pure TypeScript: no DOM, no Node API.
//
// Rounding (assumptions EZD-607): every line is whole VA, half up, before it is summed; amps are VA x 10 / 240 half
// up to 0.1 A; percent of service is whole, half up. All of it in integer arithmetic, so 149.45 never lands on 149.4.
// The optional method (220.83), the five cases and the further Table 220.55 rows are EZD-615 (09r; Q-0761).

/** 09a "Inputs": the kinds of load the standard method places on its lines. */
export const LOAD_CALC_KINDS = [
  'fixed_appliance',
  'dryer',
  'range',
  'heating',
  'cooling',
  'ev_charger',
  'other',
] as const;
export type LoadCalcKind = (typeof LOAD_CALC_KINDS)[number];

export type LoadCalcLoad = {
  id: string;
  name: string;
  kind: LoadCalcKind;
  /** Appliance type for the default rating (EZD-614), e.g. "dishwasher". */
  applianceType?: string;
  /** The item's rating in VA; null when it has none (the default, then the calc error). */
  va: number | null;
  /** A motor load, for the 25% largest-motor line. */
  motor?: boolean;
};

export type LoadCalcInput = {
  /** Dwelling floor area, sq ft; null gives the calc error naming it. */
  floorAreaSqFt: number | null;
  smallApplianceCircuits: number;
  laundryCircuits: number;
  loads: readonly LoadCalcLoad[];
  /** Per-project rating overrides, VA by load id (EZD-608). */
  overrides?: Readonly<Record<string, number>>;
  /** Company appliance rating defaults, VA by appliance type (EZD-614). */
  defaults?: Readonly<Record<string, number>>;
  /**
   * The largest-motor line is editable (09a): a load id picks the motor; null leaves the line out; absent, the largest
   * motor load.
   */
  largestMotorId?: string | null;
  /** Service rating, amps; null: no comparison. */
  serviceAmps: number | null;
};

export type LoadCalcLineKey =
  | 'general_lighting'
  | 'small_appliance'
  | 'laundry'
  | 'subtotal'
  | 'demand'
  | 'fixed_appliances'
  | 'dryer'
  | 'range'
  | 'heating_cooling'
  | 'largest_motor'
  | 'ev_charger'
  | 'other'
  | 'total';

/** One printed line: the NEC section, the numbers that went in, and its VA. */
export type LoadCalcLine = {
  key: LoadCalcLineKey;
  /** 2023 NEC section, e.g. "220.41"; empty for subtotal and total. */
  ref: string;
  va: number;
  /** The numbers the line is built from (sq ft, counts, sums, percents, the chosen load). */
  detail: Readonly<Record<string, number | string>>;
  /** Load ids the line is made of. */
  loads?: readonly string[];
};

export type LoadCalcError =
  | { code: 'missing_floor_area' }
  | { code: 'missing_rating'; loadId: string; name: string }
  | { code: 'range_unsupported'; loadIds: readonly string[] }
  | { code: 'unknown_motor'; loadId: string };

export type LoadCalcResult =
  | {
      ok: true;
      lines: readonly LoadCalcLine[];
      totalVa: number;
      /** Amps at 240 V in tenths (1,495 is 149.5 A), exact. */
      ampsTenths: number;
      amps: number;
      /** Null when no service rating is known. */
      service: {
        amps: number;
        percent: number;
        spareTenths: number;
        spareAmps: number;
        pass: boolean;
      } | null;
    }
  | { ok: false; errors: readonly LoadCalcError[] };

export const LOAD_CALC_VOLTS = 240;
/** 220.41: 3 VA per sq ft (2023 NEC). */
export const GENERAL_LIGHTING_VA_PER_SQFT = 3;
/** 220.52(A) and (B): 1,500 VA per circuit. */
export const BRANCH_CIRCUIT_VA = 1500;
/** 220.54: 5,000 VA minimum per dryer. */
export const DRYER_MIN_VA = 5000;
/** Table 220.55 column C, one range not over 12 kW. */
export const ONE_RANGE_COLUMN_C_VA = 8000;
/** 220.53: 500 VA or more each (09a "each rated 1/4 hp or 500 W or more"; no hp field). */
export const FIXED_APPLIANCE_MIN_VA = 500;
/** 220.57 under the 2023 NEC: the larger of nameplate or 7,200 VA (09a case 4; Q-0761). */
export const EV_CHARGER_MIN_VA = 7200;

/** n / d rounded half up, for n >= 0 and d > 0 (integers). */
function divHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** Whole VA, half up (assumptions EZD-607: each line to whole VA before summing). */
function wholeVa(x: number): number {
  return Math.floor(x + 0.5);
}

/** Table 220.45: first 3,000 VA at 100%, the next 117,000 at 35%, the rest at 25%, as a whole-VA line. */
export function lightingDemandVa(subtotal: number): number {
  const s = wholeVa(subtotal);
  const first = Math.min(s, 3000);
  const next = Math.min(Math.max(s - 3000, 0), 117000);
  const rest = Math.max(s - 120000, 0);
  return divHalfUp(first * 100 + next * 35 + rest * 25, 100);
}

/** Amps in tenths at 240 V, half up, exact on whole VA. */
export function ampsTenthsAt240(va: number): number {
  return divHalfUp(wholeVa(va) * 10, LOAD_CALC_VOLTS);
}

export function standardLoadCalc(input: LoadCalcInput): LoadCalcResult {
  const errors: LoadCalcError[] = [];
  const rating = (l: LoadCalcLoad): number | null => {
    const v =
      input.overrides?.[l.id] ??
      l.va ??
      (l.applianceType === undefined ? undefined : input.defaults?.[l.applianceType]);
    if (v === undefined || v === null) {
      errors.push({ code: 'missing_rating', loadId: l.id, name: l.name });
      return null;
    }
    return wholeVa(v);
  };
  if (input.floorAreaSqFt === null) errors.push({ code: 'missing_floor_area' });

  const rated = input.loads.map((l) => ({ load: l, va: rating(l) }));
  const of = (k: LoadCalcKind) => rated.filter((r) => r.load.kind === k);
  const sum = (rs: { va: number | null }[]) => rs.reduce((a, r) => a + (r.va ?? 0), 0);
  const ids = (rs: { load: LoadCalcLoad }[]) => rs.map((r) => r.load.id);

  const ranges = of('range');
  // One range not over 12 kW is the only Table 220.55 row here; a lone cooking item of 1 3/4 kW or less counts at
  // nameplate (09r; Q-0761). Any other setup is EZD-615's rows, and until then the calc error naming the range line.
  const rangeVa = sum(ranges);
  if (ranges.length > 1 || rangeVa > 12000)
    errors.push({ code: 'range_unsupported', loadIds: ids(ranges) });

  const motors = rated.filter((r) => r.load.motor === true);
  let motor: (typeof rated)[number] | undefined;
  if (input.largestMotorId === null) {
    motor = undefined;
  } else if (input.largestMotorId !== undefined) {
    motor = rated.find((r) => r.load.id === input.largestMotorId);
    if (motor === undefined) errors.push({ code: 'unknown_motor', loadId: input.largestMotorId });
  } else {
    for (const r of motors) if (motor === undefined || (r.va ?? 0) > (motor.va ?? 0)) motor = r;
  }

  if (errors.length > 0) return { ok: false, errors };

  const area = input.floorAreaSqFt as number;
  const lines: LoadCalcLine[] = [];
  const lighting = wholeVa(area * GENERAL_LIGHTING_VA_PER_SQFT);
  lines.push({
    key: 'general_lighting',
    ref: '220.41',
    va: lighting,
    detail: { sqft: area, vaPerSqft: GENERAL_LIGHTING_VA_PER_SQFT },
  });
  const small = input.smallApplianceCircuits * BRANCH_CIRCUIT_VA;
  lines.push({
    key: 'small_appliance',
    ref: '220.52(A)',
    va: small,
    detail: { circuits: input.smallApplianceCircuits, vaEach: BRANCH_CIRCUIT_VA },
  });
  const laundry = input.laundryCircuits * BRANCH_CIRCUIT_VA;
  lines.push({
    key: 'laundry',
    ref: '220.52(B)',
    va: laundry,
    detail: { circuits: input.laundryCircuits, vaEach: BRANCH_CIRCUIT_VA },
  });
  const subtotal = lighting + small + laundry;
  lines.push({ key: 'subtotal', ref: '', va: subtotal, detail: {} });
  const demand = lightingDemandVa(subtotal);
  lines.push({
    key: 'demand',
    ref: 'Table 220.45',
    va: demand,
    detail: {
      first: Math.min(subtotal, 3000),
      firstPercent: 100,
      next: Math.min(Math.max(subtotal - 3000, 0), 117000),
      nextPercent: 35,
      rest: Math.max(subtotal - 120000, 0),
      restPercent: 25,
    },
  });

  const fixed = of('fixed_appliance');
  if (fixed.length > 0) {
    const fixedSum = sum(fixed);
    // 220.53: 75% with four or more fastened in place, each 500 W or more; otherwise 100% (assumptions EZD-607).
    const percent =
      fixed.length >= 4 && fixed.every((r) => (r.va ?? 0) >= FIXED_APPLIANCE_MIN_VA) ? 75 : 100;
    lines.push({
      key: 'fixed_appliances',
      ref: '220.53',
      va: divHalfUp(fixedSum * percent, 100),
      detail: { sum: fixedSum, count: fixed.length, percent },
      loads: ids(fixed),
    });
  }

  const dryers = of('dryer');
  if (dryers.length > 0) {
    const va = dryers.reduce((a, r) => a + Math.max(r.va ?? 0, DRYER_MIN_VA), 0);
    lines.push({
      key: 'dryer',
      ref: '220.54',
      va,
      detail: { count: dryers.length, minimum: DRYER_MIN_VA, nameplate: sum(dryers) },
      loads: ids(dryers),
    });
  }

  if (ranges.length === 1) {
    const va = rangeVa > 1750 ? ONE_RANGE_COLUMN_C_VA : rangeVa;
    lines.push({
      key: 'range',
      ref: rangeVa > 1750 ? 'Table 220.55' : '220.55',
      va,
      detail: { nameplate: rangeVa, column: rangeVa > 1750 ? 'C' : 'nameplate', count: 1 },
      loads: ids(ranges),
    });
  }

  const heating = of('heating');
  const cooling = of('cooling');
  if (heating.length > 0 || cooling.length > 0) {
    const h = sum(heating);
    const c = sum(cooling);
    const heatingWins = h >= c;
    lines.push({
      key: 'heating_cooling',
      ref: '220.60',
      va: Math.max(h, c),
      detail: { heating: h, cooling: c, used: heatingWins ? 'heating' : 'cooling' },
      loads: ids(heatingWins ? heating : cooling),
    });
  }

  if (motor !== undefined) {
    const mva = motor.va ?? 0;
    lines.push({
      key: 'largest_motor',
      ref: '220.50',
      va: divHalfUp(mva * 25, 100),
      detail: { motorVa: mva, percent: 25, loadId: motor.load.id },
      loads: [motor.load.id],
    });
  }

  const ev = of('ev_charger');
  if (ev.length > 0) {
    lines.push({
      key: 'ev_charger',
      ref: '220.57',
      va: ev.reduce((a, r) => a + Math.max(r.va ?? 0, EV_CHARGER_MIN_VA), 0),
      detail: { count: ev.length, minimum: EV_CHARGER_MIN_VA, nameplate: sum(ev) },
      loads: ids(ev),
    });
  }

  const other = of('other');
  if (other.length > 0)
    lines.push({
      key: 'other',
      ref: '220.14',
      va: sum(other),
      detail: { count: other.length },
      loads: ids(other),
    });

  // The total starts at the demand line: lighting, small-appliance and laundry are inside it.
  const totalVa = lines
    .slice(lines.findIndex((l) => l.key === 'demand'))
    .reduce((a, l) => a + l.va, 0);
  lines.push({ key: 'total', ref: '', va: totalVa, detail: {} });

  const ampsTenths = ampsTenthsAt240(totalVa);
  let service: Extract<LoadCalcResult, { ok: true }>['service'] = null;
  if (input.serviceAmps !== null && input.serviceAmps > 0) {
    const s = input.serviceAmps;
    const spareTenths = s * 10 - ampsTenths;
    service = {
      amps: s,
      percent: divHalfUp(ampsTenths * 10, s),
      spareTenths,
      spareAmps: spareTenths / 10,
      pass: ampsTenths <= s * 10,
    };
  }
  return { ok: true, lines, totalVa, ampsTenths, amps: ampsTenths / 10, service };
}
