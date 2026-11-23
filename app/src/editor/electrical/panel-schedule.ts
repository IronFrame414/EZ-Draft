// EZD-609 (S06 Controls "Panel tab | Left panel segment | Compact panel schedule: two columns of spaces (odd/even)
// with circuit number, name, breaker; open spaces shown empty. Click a space selects its circuit.", "Panel schedule |
// Inspector, bottom | Opens the generated panel schedule: space, circuit, breaker size, poles, wire size, AFCI/GFCI
// type, load; flags spaces left. | Read only in schedule; edits happen on circuits."; S06 States "No spaces left: New
// circuit disabled; panel schedule flags it."; vault/build/assumptions.md EZD-604 "2-pole numbering" and EZD-609):
// the panel schedule, generated from the panel's circuits every time (nothing is stored). Pure: no React, no DOM.
import type { Objects } from '../model/patches';
import { takenSpaces } from './circuits';
import { circuitRows, panelRows, type CircuitRow } from './electrical';

export type ScheduleSpace = {
  space: number;
  /** The circuit in this space; null for an open space. */
  circuit: CircuitRow | null;
  /** False on the second space of a 2-pole circuit (the 3 of "1-3"), which carries the same circuit. */
  first: boolean;
};

export type PanelSchedule = {
  /** Every space in order, 1 to the last. */
  spaces: ScheduleSpace[];
  /** Open spaces; null while the panel's spaces are Not set (assumptions EZD-609). */
  spacesLeft: number | null;
};

/** One row of the compact schedule: the odd space on the left, the even one on the right (board S06 "1-3"). */
export type ScheduleRow = { left: ScheduleSpace; right: ScheduleSpace };

/**
 * The panel's schedule, or null when there is no such panel. The spaces run to the panel's spaces; while they are
 * Not set, or when a circuit sits past them, to the last space taken, rounded up to even so both columns end level.
 */
export function panelSchedule(objects: Objects, panelId: string | null): PanelSchedule | null {
  if (panelId === null) return null;
  const panel = panelRows(objects).find((p) => p.id.toLowerCase() === panelId.toLowerCase());
  if (panel === undefined) return null;
  const at = new Map<number, ScheduleSpace>();
  for (const c of circuitRows(objects, panel.id)) {
    if (at.has(c.space)) continue;
    at.set(c.space, { space: c.space, circuit: c, first: true });
    if (c.poles === 2 && !at.has(c.space + 2))
      at.set(c.space + 2, { space: c.space + 2, circuit: c, first: false });
  }
  let last = panel.spaces ?? 0;
  for (const s of at.keys()) last = Math.max(last, s);
  if (last % 2 === 1) last++;
  const spaces: ScheduleSpace[] = [];
  for (let s = 1; s <= last; s++)
    spaces.push(at.get(s) ?? { space: s, circuit: null, first: true });
  let spacesLeft: number | null = null;
  if (panel.spaces !== null) {
    const taken = takenSpaces(objects, panel.id);
    spacesLeft = 0;
    for (let s = 1; s <= panel.spaces; s++) if (!taken.has(s)) spacesLeft++;
  }
  return { spaces, spacesLeft };
}

/** The compact schedule's rows: spaces 1 and 2, 3 and 4, and so on. */
export function scheduleRows(schedule: PanelSchedule): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (let i = 0; i + 1 < schedule.spaces.length; i += 2)
    rows.push({ left: schedule.spaces[i]!, right: schedule.spaces[i + 1]! });
  return rows;
}
