// Gap box, pick mode, absorb and keep out of square (EZD-210a; vault/plans/EZD-210a.md section 3 C22-C31, Decided
// "Gap box", "Gap size text", "Pick mode", "pickWall", "Refusal keys", "keepGap"; 00e Pick mode; S02 Esc;
// Q-0562; Q-0568; Q-0569 (b), (c); Q-0570; P205b). The gap box is derived from the walls on every call, never
// stored. Pure.
// EZD-294 Build step 14 (vault/plans/EZD-294.md Decided "gap.ts"): absorb changes only walls already in the model,
// which keep their stored numbers.
// EZD-212b (vault/plans/EZD-212b.md D12).
import {
  absorbGap,
  findClosures,
  formatLength,
  keepOutOfSquare,
  NO_NUMBERS,
  pointsEqual,
  sameBoundary,
  type AbsorbResult,
  type GapReport,
  type Point,
  type RoomObject,
  type WallObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { Change, Objects } from '../model/patches';
import { closeChainSides } from './chain-sides';
import { roomChanges, toModelObjects, wallEditChanges } from './model-changes';

export type GapAction = 'absorb' | 'keep';

export type GapBox = {
  wallIds: string[];
  at: Point;
  gap: Point;
  sizeIn: number;
  displayIn: number;
  sizeText: string;
  actions: GapAction[];
  note: MessageKey | null;
};

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function gapSizeText(displayIn: number): string {
  return displayIn === 12 ? '12"' : formatLength(displayIn, 16);
}

function freeStart(walls: readonly WallObject[], report: GapReport): Point {
  const first = walls.find((w) => sameId(w.id, report.wallIds[0] ?? ''));
  const second = walls.find((w) => sameId(w.id, report.wallIds[1] ?? ''));
  if (!first) return { x: 0, y: 0 };
  const { start, end } = first.data.geometry;
  if (!second) return { x: start.x, y: start.y };
  const g = second.data.geometry;
  const joined = pointsEqual(start, g.start) || pointsEqual(start, g.end);
  const p0 = joined ? end : start;
  return { x: p0.x, y: p0.y };
}

export function gapBoxes(
  objects: Objects,
  level: string,
  opts: { canEdit: boolean; drawingWallIds: readonly string[] },
): GapBox[] {
  const lvl = level.toLowerCase();
  const model = toModelObjects(objects, level);
  const walls = model.filter((o): o is WallObject => o.type === 'wall');
  const rooms = model.filter(
    (o): o is RoomObject => o.type === 'room' && o.data.level.toLowerCase() === lvl,
  );
  const drawing = new Set(opts.drawingWallIds.map((id) => id.toLowerCase()));
  const boxes: GapBox[] = [];
  for (const report of findClosures(walls, level)) {
    if (report.kind !== 'gap') continue;
    if (report.wallIds.some((id) => drawing.has(id.toLowerCase()))) continue;
    const resolved = rooms.some(
      (r) =>
        r.data.closureOverride !== null &&
        pointsEqual(r.data.closureOverride.gap, report.gap) &&
        sameBoundary(r.data.geometry.boundary, report.boundary),
    );
    if (resolved) continue;
    const p0 = freeStart(walls, report);
    const actions: GapAction[] = !opts.canEdit
      ? []
      : report.parallelWallIds.length > 0
        ? ['absorb', 'keep']
        : ['keep'];
    boxes.push({
      wallIds: [...report.wallIds],
      at: { x: p0.x - report.gap.x / 2, y: p0.y - report.gap.y / 2 },
      gap: { x: report.gap.x, y: report.gap.y },
      sizeIn: report.sizeIn,
      displayIn: report.displayIn,
      sizeText: gapSizeText(report.displayIn),
      actions,
      note: opts.canEdit && actions.length === 1 ? 'office.tools.gap.use_move' : null,
    });
  }
  return boxes;
}

export type PickState = { readonly gapWallIds: readonly string[] } | null;

export type PickInput =
  { type: 'start'; gapWallIds: readonly string[] } | { type: 'escape' } | { type: 'done' };

export function reducePick(
  state: PickState,
  input: PickInput,
): { state: PickState; handled: boolean } {
  switch (input.type) {
    case 'start':
      return { state: { gapWallIds: [...input.gapWallIds] }, handled: true };
    case 'escape':
      return { state: null, handled: state !== null };
    case 'done':
      return { state: null, handled: true };
  }
}

export type GapEditResult = { ok: true; changes: Change[] } | { ok: false; messageKey: MessageKey };

export function absorbRefusalKey(
  reason: Extract<AbsorbResult, { ok: false }>['reason'],
): MessageKey {
  switch (reason) {
    case 'no_gap':
      return 'office.tools.gap.gone';
    case 'wall_not_found':
    case 'not_in_chain':
      return 'office.tools.gap.not_in_room';
    case 'across_gap':
      return 'office.tools.gap.across';
    case 'zero_length':
      return 'office.tools.gap.zero_length';
    case 'too_long':
      return 'office.tools.gap.too_long';
    case 'join_lost':
      return 'office.tools.gap.join_lost';
  }
}

export function pickWall(
  objects: Objects,
  level: string,
  gapWallIds: readonly string[],
  wallId: string,
  newId: () => string,
): GapEditResult {
  const model = toModelObjects(objects, level);
  const r = absorbGap(model, gapWallIds, wallId);
  if (!r.ok) return { ok: false, messageKey: absorbRefusalKey(r.reason) };
  const walls = model.filter((o): o is WallObject => o.type === 'wall');
  const after = (id: string): WallObject | undefined =>
    r.changed.find((w) => sameId(w.id, id)) ?? walls.find((w) => sameId(w.id, id));
  const chain = gapWallIds.map(after).filter((w): w is WallObject => w !== undefined);
  const sided = closeChainSides(chain);
  const sidedOf = (id: string) => sided.find((w) => sameId(w.id, id));
  const changed = r.changed.map((w) => sidedOf(w.id) ?? w);
  const others = chain
    .map((w, i) => ({ before: w, now: sided[i]! }))
    .filter(
      ({ before, now }) =>
        !r.changed.some((c) => sameId(c.id, before.id)) &&
        now.data.attributes.thicknessSide !== before.data.attributes.thicknessSide,
    )
    .map(({ now }) => now);
  return { ok: true, changes: wallEditChanges(objects, level, [...changed, ...others], newId, NO_NUMBERS) };
}

export function keepGap(
  objects: Objects,
  level: string,
  gapWallIds: readonly string[],
  who: string,
  when: string,
  newId: () => string,
): GapEditResult {
  const r = keepOutOfSquare(toModelObjects(objects, level), gapWallIds, who, when, newId);
  if (r.ok) return { ok: true, changes: roomChanges(r.rooms) };
  return {
    ok: false,
    messageKey: r.reason === 'no_gap' ? 'office.tools.gap.gone' : 'office.tools.gap.keep_failed',
  };
}

// EZD-213c D-Last, D-Section (vault/plans/EZD-213c.md): the inspector's Resolve the gap section reads the gap of the
// selected wall; the last wall of the chain is the one a finished chain or a marker click selects.
export type GapUiSlice = {
  readonly boxes: readonly GapBox[];
  readonly pick: PickState;
  readonly gapMessage: { readonly wallIds: readonly string[]; readonly key: MessageKey } | null;
};

export type GapSectionState = { box: GapBox; picking: boolean; alert: MessageKey | null };

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function gapLastWallId(box: GapBox): string | null {
  return box.wallIds[box.wallIds.length - 1] ?? null;
}

export function gapSection(ui: GapUiSlice, wallId: string): GapSectionState | null {
  const box = ui.boxes.find((b) => b.wallIds.some((id) => sameId(id, wallId)));
  if (box === undefined) return null;
  return {
    box,
    picking: ui.pick !== null && sameIds(ui.pick.gapWallIds, box.wallIds),
    alert:
      ui.gapMessage !== null && sameIds(ui.gapMessage.wallIds, box.wallIds)
        ? ui.gapMessage.key
        : null,
  };
}
