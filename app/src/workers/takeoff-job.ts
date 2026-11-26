// EZD-1611a (09i Takeoff rules; S19 Decision 3 "Takeoff recomputes in the browser from the working copy"; P3; EZD-235b
// serveJobs): the takeoff job a pooled worker runs on the working version's stored objects, and the settings it reads
// from Defaults (the project's copy of the waste factors first, then the company's, Q-0697 03). An object that does
// not parse is left out, as the plan leaves it out. The Takeoff screen (EZD-1613) starts the worker.
// EZD-1611b: the job runs the whole takeoff (room finishes, then countertops, cabinets, fixtures, devices and wire), and
// reads the countertop waste and the wire slack too.
import { parseStoredObject, type ModelObject, type StoredObject } from '@ezdraft/geometry';
import { takeoff, type TakeoffAllSettings, type TakeoffAnyLine } from '@ezdraft/geometry/takeoff';
import { DRYWALL_SHEET_SQ_FT } from '../lib/defaults/registry';

export const TAKEOFF_JOB = 'takeoff';

export type TakeoffJobInput = { objects: readonly StoredObject[]; settings: TakeoffAllSettings };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The takeoff's numbers from the effective Defaults; a waste or pattern the owner has not entered stays null.
export function takeoffSettingsFrom(read: (key: string) => unknown): TakeoffAllSettings {
  const positive = (key: string, fallback: number) => {
    const v = num(read(key));
    return v !== null && v > 0 ? v : fallback;
  };
  return {
    waste: {
      tile: num(read('waste_tile')),
      drywall: num(read('waste_drywall')),
      paint: num(read('waste_paint')),
      trim: num(read('waste_trim')),
    },
    pattern: {
      straight: num(read('pattern_straight')),
      diagonal: num(read('pattern_diagonal')),
      herringbone: num(read('pattern_herringbone')),
    },
    // The formulas table's numbers stand in only when a value is missing or not usable.
    tileBoxSqFt: positive('tile_box_coverage', 10),
    drywallSheetSqFt: (() => {
      const sheet = read('drywall_sheet');
      return typeof sheet === 'string' && Object.hasOwn(DRYWALL_SHEET_SQ_FT, sheet)
        ? DRYWALL_SHEET_SQ_FT[sheet]!
        : 32;
    })(),
    paintCoats: positive('paint_coats', 2),
    paintSqFtPerGallon: positive('paint_coverage', 350),
    countertopWaste: num(read('waste_countertop')),
    // 09i Wire "Slack 15%"; 0 is a usable slack.
    wireSlack: (() => {
      const v = num(read('wire_slack'));
      return v !== null && v >= 0 ? v : 15;
    })(),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readSettings(v: unknown): TakeoffAllSettings {
  if (!isRecord(v) || !isRecord(v.waste) || !isRecord(v.pattern)) throw new Error('takeoff_input');
  const waste = v.waste;
  const pattern = v.pattern;
  return takeoffSettingsFrom((key) => {
    if (key === 'waste_countertop') return v.countertopWaste;
    if (key === 'wire_slack') return v.wireSlack;
    if (key.startsWith('waste_')) return waste[key.slice('waste_'.length)];
    if (key.startsWith('pattern_')) return pattern[key.slice('pattern_'.length)];
    if (key === 'drywall_sheet') {
      const sf = v.drywallSheetSqFt;
      return Object.keys(DRYWALL_SHEET_SQ_FT).find((k) => DRYWALL_SHEET_SQ_FT[k] === sf) ?? null;
    }
    const field = {
      tile_box_coverage: 'tileBoxSqFt',
      paint_coats: 'paintCoats',
      paint_coverage: 'paintSqFtPerGallon',
    }[key];
    return field === undefined ? null : v[field];
  });
}

export function runTakeoff(input: unknown): TakeoffAnyLine[] {
  if (!isRecord(input) || !Array.isArray(input.objects)) throw new Error('takeoff_input');
  const settings = readSettings(input.settings);
  const objects: ModelObject[] = [];
  for (const stored of input.objects as unknown[]) {
    if (!isRecord(stored)) continue;
    const parsed = parseStoredObject(stored as StoredObject);
    if (parsed.ok) objects.push(parsed.object);
  }
  return takeoff(objects, settings);
}
