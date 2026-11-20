// EZD-405 (S04 Controls "Drag box side edge | Resizes width in the run increment (3") | Code updates (e.g. B15 to
// B18)", "Drag box | Reorders within the run; others shift", "Delete / Backspace | Removes selected box(es)",
// "Right-click box | ... Duplicate, Delete"; S04 Validation "Box widths in standard 3" increments; custom boxes
// allowed outside increments"; AC-EZD-405-1; vault/build/assumptions.md EZD-405): the edits the cabinet run screen
// makes, as pure functions over run members and runs. Where a member stands follows from its row order (EZD-402), so
// a wider box shifts the ones after it.
import { CABINET_CODE_MAX, CABINET_RUN_ROW_MAX, type CabinetRow } from '../schema';
import type { CabinetRun, CabinetRunMember } from './run';

// The run increment (S04 "3""; EZD-408 "the Defaults increment (3")").
export const CABINET_WIDTH_STEP = 3;

const EPS = 1e-6;
const onGrid = (n: number) =>
  Math.abs(n / CABINET_WIDTH_STEP - Math.round(n / CABINET_WIDTH_STEP)) < EPS;

// The width after `steps` 3" steps (positive wider, negative narrower). Each step lands on the 3" grid: a box on the
// grid moves 3" a step; a custom box's first step takes it to the grid line on that side (16 1/2" + 1 = 18",
// 16 1/2" - 1 = 15"). Never narrower than one step.
export function cabinetSteppedWidth(width: number, steps: number): number {
  const s = Math.trunc(steps);
  if (s === 0) return width;
  const q = width / CABINET_WIDTH_STEP;
  const base = onGrid(width) ? Math.round(q) : s > 0 ? Math.floor(q) : Math.ceil(q);
  return Math.max(CABINET_WIDTH_STEP, (base + s) * CABINET_WIDTH_STEP);
}

// How many steps a side-edge drag of `dx` inches (along the run) makes: the nearest whole step. The right edge
// grows to the right; the left edge grows to the left.
export function cabinetEdgeSteps(edge: 'left' | 'right', dx: number): number {
  const steps = Math.round((edge === 'right' ? dx : -dx) / CABINET_WIDTH_STEP);
  return steps === 0 ? 0 : steps; // no -0
}

const inchText = (n: number) => String(Math.round(n * 1000) / 1000);

// The code after a width change: the code's letters, then its number; when the number starts with the old width
// (B15, W1530 = width 15 then height 30, F3) the width part is swapped for the new one (B18, W1830, F6). A code
// that does not carry its width (a custom name) is kept.
export function cabinetCodeForWidth(code: string, oldWidth: number, newWidth: number): string {
  const m = /^([A-Za-z]+)(\d+(?:\.\d+)?)(.*)$/.exec(code);
  if (m === null) return code;
  const [, letters, digits, rest] = m;
  const old = inchText(oldWidth);
  if (!digits.startsWith(old)) return code;
  const next = `${letters}${inchText(newWidth)}${digits.slice(old.length)}${rest}`;
  return next.length > CABINET_CODE_MAX ? code : next;
}

// The member at its new width and code; null when nothing changes. A filler's scribe allowance is cut to its width
// (a filler cannot be scribed more than it is wide, EZD-402).
export function resizeCabinetMember(
  member: CabinetRunMember,
  width: number,
): CabinetRunMember | null {
  const a = member.data.attributes;
  if (!(width > 0) || Math.abs(width - a.width) < EPS) return null;
  const code = cabinetCodeForWidth(a.code, a.width, width);
  const attributes =
    member.type === 'cabinet_filler'
      ? { ...a, width, code, scribe: Math.min(member.data.attributes.scribe, width) }
      : { ...a, width, code };
  return { ...member, data: { ...member.data, attributes } } as CabinetRunMember;
}

// The member at a new height; null when nothing changes (S04 "Height dimension text ... Click to type upper height,
// base height").
export function reheightCabinetMember(
  member: CabinetRunMember,
  height: number,
): CabinetRunMember | null {
  const a = member.data.attributes;
  if (!(height > 0) || Math.abs(height - a.height) < EPS) return null;
  return { ...member, data: { ...member.data, attributes: { ...a, height } } } as CabinetRunMember;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function cabinetRowOf(run: CabinetRun, id: string): CabinetRow | null {
  for (const row of ['base', 'upper'] as const) {
    if (run.data.attributes[row].some((x) => same(x, id))) return row;
  }
  return null;
}

const withRow = (run: CabinetRun, row: CabinetRow, ids: string[]): CabinetRun => ({
  ...run,
  data: { ...run.data, attributes: { ...run.data.attributes, [row]: ids } },
});

// The run with `id` moved to place `toIndex` (0-based, among its row after it is taken out); null when it is not in
// the run or does not move. The others shift (S04 "Reorders within the run; others shift").
export function moveInCabinetRow(run: CabinetRun, id: string, toIndex: number): CabinetRun | null {
  const row = cabinetRowOf(run, id);
  if (row === null) return null;
  const ids = run.data.attributes[row];
  const from = ids.findIndex((x) => same(x, id));
  const rest = ids.filter((_, i) => i !== from);
  const to = Math.max(0, Math.min(rest.length, Math.trunc(toIndex)));
  if (to === from) return null;
  return withRow(run, row, [...rest.slice(0, to), ids[from], ...rest.slice(to)]);
}

// The run without `ids`; null when none of them is in it.
export function removeFromCabinetRun(run: CabinetRun, ids: readonly string[]): CabinetRun | null {
  const gone = (x: string) => ids.some((id) => same(id, x));
  const { base, upper } = run.data.attributes;
  if (!base.some(gone) && !upper.some(gone)) return null;
  return {
    ...run,
    data: {
      ...run.data,
      attributes: {
        ...run.data.attributes,
        base: base.filter((x) => !gone(x)),
        upper: upper.filter((x) => !gone(x)),
      },
    },
  };
}

// The run with `newId` placed right after `afterId` in its row; null when `afterId` is not in the run or the run
// holds its most members already.
export function insertAfterInCabinetRun(
  run: CabinetRun,
  afterId: string,
  newId: string,
): CabinetRun | null {
  const row = cabinetRowOf(run, afterId);
  if (row === null) return null;
  const ids = run.data.attributes[row];
  if (run.data.attributes.base.length + run.data.attributes.upper.length >= CABINET_RUN_ROW_MAX)
    return null;
  const at = ids.findIndex((x) => same(x, afterId)) + 1;
  return withRow(run, row, [...ids.slice(0, at), newId, ...ids.slice(at)]);
}
