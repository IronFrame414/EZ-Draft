// EZD-227 Build (AC-EZD-227-1, -3; Q-0704 03-data-model row 2 "blocking reuses the opening geometry exactly"; S03:152;
// Q-0630; 09q Blocking; vault/build/assumptions.md EZD-227): grab-bar blocking is a wall-hosted object that follows
// the opening's hosted-item rules. It is placed on the nearest wall within the capture distance, slides along its
// wall between corners, keeps its last spot when dragged off every wall, stays where it stands (flagged "Not on a
// wall", hostWallId null) when its wall moves without it, and is re-hosted when a wall touches it again. Each rule is
// the opening's own function, run on the blocking seen as an opening of its length; `side` rides as the opening's
// swing, so it flips where a door's swing would when the blocking changes host. Blocking never collides with doors,
// windows or other blocking (vault/build/assumptions.md EZD-227). Pure; never mutates its input.
import { placeOnWall, slideOpening } from '../moves/slide';
import { openingHostUpdates } from '../openings/hosting';
import type { OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import type { BlockingData } from '../schema/blocking';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallFaceOffsets, wallLength, type WallObject } from '../walls/wall';

export type BlockingObject = { id: string; type: 'blocking'; data: BlockingData };
export type BlockingSide = BlockingData['attributes']['side'];

// The drawn depth of the blocking inside the wall, one 2x member laid flat behind the face (assumptions EZD-227).
export const BLOCKING_DEPTH_IN = 1.5;

const tol = COMPARISON_TOLERANCE_IN;
const lower = (id: string) => id.toLowerCase();
const X_AXIS: Point = { x: 1, y: 0 };

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';
const wallsOnly = (objects: readonly ModelObject[]): WallObject[] => objects.filter(isWall);

export function isBlockingFlagged(b: BlockingObject): boolean {
  return b.data.geometry.hostWallId === null;
}

// The blocking seen as an opening of its length, so the opening's hosting functions apply unchanged.
function asOpening(b: BlockingObject): OpeningObject {
  const length = b.data.attributes.length;
  return {
    id: b.id,
    type: 'opening',
    data: {
      geometry: b.data.geometry,
      status: b.data.status,
      level: b.data.level,
      attributes: {
        kind: 'door',
        width: length,
        height: 1,
        roughOpening: { width: length, height: 1 },
        sillHeight: 0,
        swing: b.data.attributes.side,
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    },
  };
}

function fromOpening(b: BlockingObject, o: OpeningObject): BlockingObject {
  const g = o.data.geometry;
  return {
    ...b,
    data: {
      ...b.data,
      geometry: {
        center: { x: g.center.x, y: g.center.y },
        hostWallId: g.hostWallId,
        axis: g.axis === null ? null : { x: g.axis.x, y: g.axis.y },
      },
      attributes: { ...b.data.attributes, side: o.data.attributes.swing ?? b.data.attributes.side },
    },
  };
}

// A dragged blocking: along its host within the capture, onto another near wall, or left at its last spot when the
// target is off every wall (slideOpening). The result is re-hosted as the wall edits re-host it.
export function slideBlocking(input: {
  blocking: BlockingObject;
  objects: readonly ModelObject[];
  target: Point;
  captureIn: number;
}): BlockingObject {
  const b = input.blocking;
  const walls = wallsOnly(input.objects);
  const center = slideOpening({
    opening: asOpening(b),
    objects: walls,
    target: input.target,
    captureIn: input.captureIn,
  });
  const moved: BlockingObject = {
    ...b,
    data: { ...b.data, geometry: { ...b.data.geometry, center } },
  };
  return (
    blockingHostUpdates({
      level: b.data.level,
      walls,
      previousWalls: walls,
      blockings: [moved],
    })[0] ?? moved
  );
}

// The blocking a click, a lone move or a wall-unselected move puts at `target` on its host (placeOnWall), or null when refused.
export function placeBlockingOnWall(
  b: BlockingObject,
  wall: WallObject,
  objects: readonly ModelObject[],
  target: Point,
): Point | null {
  return placeOnWall(asOpening(b), wall, wallsOnly(objects), target);
}

// After a wall edit: the blocking of one level that went off every wall (flagged, left where it stands) and the
// flagged ones a wall touches again (re-hosted). Each is judged alone, so blocking never takes another's span.
export function blockingHostUpdates(input: {
  level: string;
  walls: readonly WallObject[];
  previousWalls: readonly WallObject[];
  blockings: readonly BlockingObject[];
}): BlockingObject[] {
  const out: BlockingObject[] = [];
  const sorted = [...input.blockings].sort((a, b) => (lower(a.id) < lower(b.id) ? -1 : 1));
  for (const b of sorted) {
    const [o] = openingHostUpdates({
      level: input.level,
      walls: input.walls,
      previousWalls: input.previousWalls,
      openings: [asOpening(b)],
    });
    if (o !== undefined) out.push(fromOpening(b, o));
  }
  return out;
}

// The blocking's plan outline: `length` along the wall and BLOCKING_DEPTH_IN deep behind the face on its side, in
// order face start, face end, inner end, inner start. A flagged blocking lies along its axis from the point where it
// stands. Null when a hosted blocking's wall is missing or has no length.
export function blockingOutline(
  b: BlockingObject,
  host: WallObject | null,
): [Point, Point, Point, Point] | null {
  const { center, hostWallId, axis } = b.data.geometry;
  const half = b.data.attributes.length / 2;
  const left = b.data.attributes.side === 'left';
  let d: Point;
  let start: Point;
  let sc: number;
  let face: number;
  if (hostWallId === null) {
    d = axis ?? X_AXIS;
    start = center;
    sc = 0;
    face = left ? BLOCKING_DEPTH_IN : -BLOCKING_DEPTH_IN;
  } else {
    if (host === null) return null;
    const line = host.data.geometry;
    const L = wallLength(line);
    if (L <= tol) return null;
    d = { x: (line.end.x - line.start.x) / L, y: (line.end.y - line.start.y) / L };
    start = line.start;
    sc = (center.x - start.x) * d.x + (center.y - start.y) * d.y;
    const { oL, oR } = wallFaceOffsets(host);
    face = left ? oL : oR;
  }
  const n: Point = { x: -d.y, y: d.x };
  const inner = left ? face - BLOCKING_DEPTH_IN : face + BLOCKING_DEPTH_IN;
  const at = (s: number, o: number): Point => ({
    x: start.x + s * d.x + o * n.x,
    y: start.y + s * d.y + o * n.y,
  });
  return [at(sc - half, face), at(sc + half, face), at(sc + half, inner), at(sc - half, inner)];
}
