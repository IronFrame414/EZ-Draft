// EZD-701 (S13 Decision 1; 09h Sheet set rules; Q-0779; AC-EZD-701-1, -2): the permit set's default sheets. One
// fixed list in set order (Round 24, with the mockup order corrected); the reflected ceiling plan (A6.0) is kept
// only when the project's "Reflected ceiling plan" scope box is ticked. The Electrical, Plumbing and Mechanical
// boxes do not change the set (Q-0764: they feed the scope-match check). Titles are the S13 mockup's sheet list.
// The set is derived from the project for now; sheets become stored model objects (03b rule 3) when a later
// ticket makes them adjustable (vault/build/assumptions.md EZD-701). The fields follow the 03c `sheet` row.
import type { ScopeTrade } from '../projects/new-project';

// The sheet list's groups (S13 Layout: Architectural / Electrical / Renderings).
export const SHEET_GROUPS = ['architectural', 'electrical', 'renderings'] as const;
export type SheetGroup = (typeof SHEET_GROUPS)[number];

export type Sheet = {
  number: string;
  title: string;
  group: SheetGroup;
  // Filled by the viewports ticket (EZD-703); a default sheet has none yet (S13 States: Empty).
  viewports: readonly string[];
};

type SheetDef = Omit<Sheet, 'viewports'> & { needs?: ScopeTrade };

const DEFAULT_SET: readonly SheetDef[] = [
  { number: 'A0.0', title: 'Cover', group: 'architectural' },
  { number: 'A1.0', title: 'Existing', group: 'architectural' },
  { number: 'A2.0', title: 'Demo', group: 'architectural' },
  { number: 'A3.0', title: 'Proposed', group: 'architectural' },
  { number: 'A4.0', title: 'Elevations', group: 'architectural' },
  { number: 'A5.0', title: 'Details', group: 'architectural' },
  { number: 'A6.0', title: 'RCP', group: 'architectural', needs: 'rcp' },
  { number: 'E1.0', title: 'Electrical', group: 'electrical' },
  { number: 'E2.0', title: 'Panel + load calc', group: 'electrical' },
  { number: 'R1.0', title: 'Finish schedule + renders', group: 'renderings' },
];

// The default permit set for a project with these scope boxes ticked, in set order.
export function defaultSheetSet(scopeTrades: readonly ScopeTrade[]): Sheet[] {
  return DEFAULT_SET.filter((s) => s.needs === undefined || scopeTrades.includes(s.needs)).map(
    ({ number, title, group }) => ({ number, title, group, viewports: [] }),
  );
}
