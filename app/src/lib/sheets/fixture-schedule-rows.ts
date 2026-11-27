// EZD-508 (S05 Controls "Fixture schedule rows | Left panel | One row per type tag (A, F, S, T): tag, description,
// count. Click selects all fixtures of that type on canvas. | Read only list."; S05 Data shown "Fixture schedule: tag,
// description, count"; board S05Ceiling left panel "Fixture schedule"; AC-EZD-508-1 "Counts update when lights are
// placed or deleted."): the rows of the left panel's fixture schedule for the open floor. The fixtures are the devices
// that carry a fixture type (EZD-507: recessed light and ceiling fan). A light is placed with no type tag (EZD-507), so
// untagged fixtures count in one row per kind with no tag, after the tagged rows; Demo fixtures are left out
// (vault/build/assumptions.md EZD-508).
// EZD-708a: moved here from editor/ceiling/fixture-schedule.ts (which re-exports it) so the RCP sheet's schedule
// (fixture-schedule-table.ts) reads the same rows without importing editor code (EZD-020 import boundaries).
import { FIXTURE_TYPE_DEVICE_KINDS, deviceDataSchema } from '@ezdraft/geometry';
import type { Objects } from '../../editor/model/patches';

export type FixtureKind = (typeof FIXTURE_TYPE_DEVICE_KINDS)[number];

export type FixtureScheduleRow = {
  /** The type tag; null for the row of a kind's untagged fixtures. */
  tag: string | null;
  /** The kind of the row's first fixture (stored order); the description names it. */
  kind: FixtureKind;
  /** The first fixture's color temperature in kelvin, when it has one. */
  colorTemp: number | null;
  /** EZD-708a (the sheet's full schedule): the first fixture's lumens, trim and catalog item, when it has them. */
  lumens: number | null;
  trim: string | null;
  catalogItemId: string | null;
  count: number;
  /** The row's fixtures in stored order; a row click selects them. */
  ids: string[];
};

const KINDS: readonly string[] = FIXTURE_TYPE_DEVICE_KINDS;

/** The open floor's fixture schedule: tagged rows by tag (A, F, S, T), then each kind's untagged row. */
export function fixtureScheduleRows(objects: Objects, floorId: string | null): FixtureScheduleRow[] {
  if (floorId === null) return [];
  const floor = floorId.toLowerCase();
  const tagged = new Map<string, FixtureScheduleRow>();
  const untagged = new Map<string, FixtureScheduleRow>();
  for (const [id, v] of objects) {
    if (v.type !== 'device') continue;
    const parsed = deviceDataSchema.safeParse(v.data);
    if (!parsed.success) continue;
    const d = parsed.data;
    const kind = d.attributes.kind;
    if (!KINDS.includes(kind) || d.status === 'demo' || d.level.toLowerCase() !== floor) continue;
    const tag = d.attributes.typeTag?.trim() || null;
    const rows = tag === null ? untagged : tagged;
    const key = tag ?? kind;
    const row = rows.get(key);
    if (row === undefined)
      rows.set(key, {
        tag,
        kind: kind as FixtureKind,
        colorTemp: d.attributes.colorTemp ?? null,
        lumens: d.attributes.lumens ?? null,
        trim: d.attributes.trim ?? null,
        catalogItemId: d.attributes.catalogItemId ?? null,
        count: 1,
        ids: [id],
      });
    else {
      row.count += 1;
      row.ids.push(id);
    }
  }
  const byTag = [...tagged.values()].sort((a, b) =>
    a.tag!.localeCompare(b.tag!, 'en', { numeric: true }),
  );
  const byKind = KINDS.flatMap((k) => {
    const row = untagged.get(k);
    return row === undefined ? [] : [row];
  });
  return [...byTag, ...byKind];
}
