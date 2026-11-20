// EZD-413 (S04b Controls "Cutout | Canvas tool bar | Place a sink or cooktop cutout; link to the fixture/appliance
// cutout size from catalog"; phase-04 EZD-413 "sink and cooktop cutouts with a typed W × D (default from the fixture
// under them)"; AC-EZD-413-2 "a typed 30" × 16" cutout draws at that size"; vault/build/assumptions.md EZD-413): the
// Cutout tool as model changes. Pure: no React, no DOM. Placing and resizing are one change each (one undo step).
import {
  cutoutAxisAt,
  cutoutCorners,
  cutoutFixtureAt,
  cutoutFromFixture,
  placeCountertopCutout,
  pointInRing,
  resizeCountertopCutout,
  type CountertopCutout,
  type CountertopCutoutKind,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import {
  countertopChange,
  countertopPieceAt,
  countertopPieces,
  type CountertopPiece,
} from './trace-tool';

export type CutoutChoice = { kind: CountertopCutoutKind; width: number; depth: number };

// A cutout clicked at `at`. Over a sink or cooktop it takes that fixture's kind, center, direction and W × D and is
// linked to it; on a bare top it takes the chosen kind and typed W × D at the click (its center on the `increment`
// grid, the Defaults countertop increment), its width along the nearest side. No changes off every piece or when it
// would not fit the top.
export function countertopCutoutChanges(
  objects: readonly ModelObject[],
  level: string | null,
  at: Point,
  choice: CutoutChoice,
  newId: () => string,
  increment: number | null = null,
): {
  changes: Change[];
  pieceId: string | null;
  cutoutId: string | null;
  cutout: CountertopCutout | null;
} {
  const none = { changes: [], pieceId: null, cutoutId: null, cutout: null };
  if (level === null) return none;
  const pieces = countertopPieces(objects, level);
  const pieceId = countertopPieceAt(pieces, at);
  const piece = pieces.find((p) => p.id === pieceId);
  if (piece === undefined) return none;
  const id = newId();
  const fixture = cutoutFixtureAt(objects, level, at);
  const cutout: CountertopCutout =
    fixture !== null
      ? cutoutFromFixture(id, fixture)
      : {
          id,
          kind: choice.kind,
          center: snapCenter(at, increment),
          axis: cutoutAxisAt(piece.data.geometry.outline, at),
          width: choice.width,
          depth: choice.depth,
          fixtureId: null,
        };
  const next = placeCountertopCutout(piece.data, cutout);
  if (next === null) return none;
  return { changes: [countertopChange(piece.id, next)], pieceId: piece.id, cutoutId: id, cutout };
}

function snapCenter(at: Point, increment: number | null): Point {
  if (increment === null || !(increment > 0)) return { x: at.x, y: at.y };
  const r = (n: number) => {
    const v = Math.round(n / increment) * increment;
    return Math.abs(v) < 1e-9 ? 0 : v;
  };
  return { x: r(at.x), y: r(at.y) };
}

// Cutout `cutoutId` on piece `pieceId` typed to `width` × `depth`; [] when either is not there or it would not fit.
export function countertopCutoutSizeChanges(
  objects: readonly ModelObject[],
  pieceId: string,
  cutoutId: string,
  width: number,
  depth: number,
): Change[] {
  const key = pieceId.toLowerCase();
  const o = objects.find((x) => x.id.toLowerCase() === key);
  if (o === undefined || o.type !== 'countertop_piece') return [];
  const next = resizeCountertopCutout(o.data, cutoutId, width, depth);
  return next === null ? [] : [countertopChange(o.id, next)];
}

// The cutout under `at` on the pieces shown (the last placed on top wins); null with none.
export function countertopCutoutAt(
  pieces: readonly CountertopPiece[],
  at: Point,
): { pieceId: string; cutout: CountertopCutout } | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const list = pieces[i]!.data.attributes.cutouts ?? [];
    for (let j = list.length - 1; j >= 0; j--)
      if (pointInRing(at, cutoutCorners(list[j]!))) return { pieceId: pieces[i]!.id, cutout: list[j]! };
  }
  return null;
}
