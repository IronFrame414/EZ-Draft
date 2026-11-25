// EZD-412 (S04b Controls "Draw outline | Canvas tool bar | Click points to draw a custom top shape; typed lengths |
// Snaps as in 03", "Drag outline vertex | Canvas | Reshape custom outline", "Undo / redo, Esc | Global | As in 03";
// vault/build/assumptions.md EZD-412): the Draw outline tool and the vertex drag as a small state machine and model
// changes. Pure: no React, no DOM. A closed outline is one new piece and a drag is one change, each one undo step.
import {
  cabinetFootprints,
  COUNTERTOP_DEFAULT_THICKNESS,
  countertopFromOutline,
  moveCountertopVertex,
  withCountertopSupport,
  type CountertopSupportSettings,
  nextCountertopLabels,
  outlineClick,
  outlineTypedPoint,
  snapOutlinePoint,
  type CountertopOutlineDraft,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import { countertopChange, countertopPieces } from './trace-tool';

// The corners the outline snaps to: every base cabinet corner and every top corner on the floor.
export function outlineSnapTargets(objects: readonly ModelObject[], level: string | null): Point[] {
  if (level === null) return [];
  return [
    ...cabinetFootprints(objects, level).flatMap((f) => f.outline),
    ...countertopPieces(objects, level).flatMap((p) => p.data.geometry.outline),
  ];
}

export type OutlineToolState = { draft: CountertopOutlineDraft; cursor: Point | null };
export const INITIAL_OUTLINE_STATE: OutlineToolState = { draft: { points: [] }, cursor: null };

// `radius` is the snap and close distance in inches (the screen's pick radius at its scale); `increment` is the
// Defaults countertop increment.
export type OutlineContext = {
  targets: readonly Point[];
  increment: number | null;
  radius: number;
};

export type OutlineInput =
  | { type: 'move'; at: Point }
  | { type: 'click'; at: Point }
  | { type: 'typed'; length: number }
  | { type: 'escape' };

// `closed` is the finished outline when this input closed it; the state is then empty again for the next top.
export type OutlineStep = { state: OutlineToolState; closed: Point[] | null };

export function snapForOutline(state: OutlineToolState, at: Point, ctx: OutlineContext): Point {
  const pts = state.draft.points;
  return snapOutlinePoint(at, {
    targets: pts.length >= 3 ? [pts[0]!, ...ctx.targets] : ctx.targets,
    last: pts[pts.length - 1] ?? null,
    increment: ctx.increment,
    radius: ctx.radius,
  });
}

export function outlineInput(
  state: OutlineToolState,
  i: OutlineInput,
  ctx: OutlineContext,
): OutlineStep {
  switch (i.type) {
    case 'move':
      return { state: { ...state, cursor: snapForOutline(state, i.at, ctx) }, closed: null };
    case 'click':
    case 'typed': {
      const at =
        i.type === 'click'
          ? snapForOutline(state, i.at, ctx)
          : state.cursor === null
            ? null
            : outlineTypedPoint(state.draft, i.length, state.cursor);
      if (at === null) return { state, closed: null };
      const r = outlineClick(state.draft, at, i.type === 'click' ? ctx.radius : 1e-6);
      if (r.kind === 'closed') return { state: INITIAL_OUTLINE_STATE, closed: r.points };
      return {
        state: { draft: r.draft, cursor: i.type === 'typed' ? at : state.cursor },
        closed: null,
      };
    }
    case 'escape':
      return { state: INITIAL_OUTLINE_STATE, closed: null };
  }
}

// The new piece a closed outline makes, labelled with the next free letter on the floor.
export function countertopOutlineChanges(
  objects: readonly ModelObject[],
  level: string | null,
  points: readonly Point[],
  newId: () => string,
): { changes: Change[]; id: string | null } {
  if (level === null) return { changes: [], id: null };
  const used = countertopPieces(objects, level).map((p) => p.data.attributes.label);
  const [label] = nextCountertopLabels(used, 1);
  if (label === undefined) return { changes: [], id: null };
  const data = countertopFromOutline(points, {
    level,
    label,
    thickness: COUNTERTOP_DEFAULT_THICKNESS,
  });
  if (data === null) return { changes: [], id: null };
  const id = newId();
  return { changes: [countertopChange(id, data)], id };
}

// Corner `index` of piece `id` dragged to `to`; [] when the piece is not there or the outline would not be valid. With
// `support` (EZD-415) the seating support requirement is worked out again for the new side lengths.
export function countertopVertexChanges(
  objects: readonly ModelObject[],
  id: string,
  index: number,
  to: Point,
  support?: CountertopSupportSettings,
): Change[] {
  const key = id.toLowerCase();
  const o = objects.find((x) => x.id.toLowerCase() === key);
  if (o === undefined || o.type !== 'countertop_piece') return [];
  const next = moveCountertopVertex(o.data, index, to);
  if (next === null) return [];
  return [countertopChange(o.id, support === undefined ? next : withCountertopSupport(next, support))];
}
