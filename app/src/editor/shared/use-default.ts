// EZD-1910 (editor plan R12): one hook for the editor's Defaults readers, in place of a `useSyncExternalStore` over
// `session.defaults` per reader. Every reader subscribes to the same store, so one resync (EZD-116, AC-EZD-116-8)
// updates them all in the same render.
import { useMemo } from 'react';
import { bindingsOf, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import type { ProjectDefaults } from '../project-defaults';
import { useStoreValue } from './use-store-value';

type DefaultsSource = Pick<ProjectDefaults, 'get' | 'subscribe'>;

/** What one reader makes of the effective Defaults (a value missing while not set). The result must be plain JSON. */
export type DefaultReader<T> = (values: Readonly<Record<string, unknown>>) => T;

/**
 * The value `read` makes of the open project's Defaults, re-read on every defaults resync; `read({})` while there is
 * no session. The value is kept as text, so it keeps its identity until a Default it reads changes.
 */
export function useDefault<T>(defaults: DefaultsSource | null | undefined, read: DefaultReader<T>): T {
  const text = useStoreValue(defaults, (d) => JSON.stringify(read(d.get())), JSON.stringify(read({})));
  return useMemo(() => JSON.parse(text) as T, [text]);
}

const numberOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// EZD-412, EZD-416, EZD-414, EZD-415: the Defaults the countertop screen, panel and inspector read (per project).
const COUNTERTOP_KEYS = [
  'overhang_standard',
  'overhang_against_wall',
  'countertop_increment',
  'overhang_seating_counter',
  'overhang_seating_bar',
  'seating_support_limit',
  'countertop_bracket_spacing',
  'countertop_seat_width',
];

/** The Defaults the editor page reads. */
export const editorDefaults = {
  // EZD-407: the "Cabinet fit" tolerance for the fit chip; null while not set.
  fitTolerance: (d) => numberOrNull(d['cabinet_fit_tolerance']),
  // EZD-222 (S15d Keyboard shortcuts): the company key map for the rail's tooltips and the Help list.
  keyboardShortcuts: (d): ShortcutBindings => bindingsOf(d['keyboard_shortcuts']),
  // EZD-408: the "Cabinet auto-fill increment" for Auto-fill run; null while not read or not above zero.
  autoFillIncrement: (d) => {
    const v = d['cabinet_autofill_increment'];
    return typeof v === 'number' && v > 0 ? v : null;
  },
  // EZD-515 (S05 Validation; S05 Decision 4): the "Fan blade clearance"; null while Not set (no fan check).
  fanClearance: (d) => numberOrNull(d['fan_blade_clearance']),
  // EZD-511 (S05 Validation): the "ACT minimum border" as a share of the tile; half a tile while not read.
  actMinShare: (d) => {
    const v = d['act_min_border'];
    return v === '1/4' ? 1 / 4 : v === '1/3' ? 1 / 3 : 1 / 2;
  },
  // EZD-509 (S05 Decision 6): the light target per room type, CU and LLF auto-layout reads; null while Not set.
  autoLayout: (d) => {
    const targets = d['light_targets'];
    return {
      lightTargets:
        typeof targets === 'object' && targets !== null && !Array.isArray(targets)
          ? (targets as Record<string, number>)
          : null,
      cu: numberOrNull(d['light_cu']),
      llf: numberOrNull(d['light_llf']),
    };
  },
  // One reader for all eight countertop Defaults (one hook instead of eight keeps the editor route in its budget).
  countertopDefaults: (d): Record<string, number | null> =>
    Object.fromEntries(COUNTERTOP_KEYS.map((k) => [k, numberOrNull(d[k])])),
} satisfies Record<string, DefaultReader<unknown>>;
