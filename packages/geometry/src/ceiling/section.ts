// EZD-506 (S05 Controls "Section A-A preview: Live section through the selected beams: adjoining height, beam height,
// ridge height. Read only."; board S05Ceiling section SVG; AC-EZD-506-1): the section through a beam set, in model
// inches. Pure.
//
// The cut runs square to the ridge (the board shows the gable) through the middle of the set. Section x is the
// distance along the cut from the room's first wall; z is the height above the finished floor. Across-ridge beams
// run along the cut, so the beam nearest the middle shows as one long shape; with-ridge beams are cut, so each
// shows as its W x H box. The ceiling slope comes from the plate height, the ridge height and where the ridge is,
// so the profile always closes (vault/build/assumptions.md EZD-506).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { DEFAULT_WALL_HEIGHT_IN } from '../walls/wall';
import type { BeamData, ModelObject, Point, RoomData } from '../schema';
import {
  adjoiningRoom,
  beamLayout,
  finishedCeilingHeight,
  ridgeDirection,
  roomPlateHeight,
  roomRidgeHeight,
} from './beams';

const tol = COMPARISON_TOLERANCE_IN;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

export type SectionPoint = { x: number; z: number };

export type BeamSection = {
  /** The room's width along the cut. */
  width: number;
  /** Floor, walls and ceiling: a polyline from the floor at x = 0 up, over and down to the floor at x = width. */
  profile: SectionPoint[];
  /** Each beam the cut shows, as a closed outline. */
  beams: SectionPoint[][];
  /** The wall plate height. */
  plate: number;
  /** The ridge height on a sloped ceiling; null on a flat one. */
  ridge: number | null;
  /** The ceiling height on a flat ceiling; null on a sloped one. */
  ceiling: number | null;
  /** The adjoining room's finished ceiling height; null when there is none. */
  adjoining: number | null;
  /** Height AFF for level beams; null for the other placements. */
  beamHeight: number | null;
};

export type SectionHeights = { plate: number | null; ridge: number | null; adjoining: number | null };

/** The section through the set's beams on its room's ceiling. */
export function beamSection(beam: BeamData, room: RoomData, heights: SectionHeights): BeamSection {
  const u = ridgeDirection(room);
  const c: Point = { x: -u.y, y: u.x };
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of room.geometry.boundary) {
    lo = Math.min(lo, dot(p, c));
    hi = Math.max(hi, dot(p, c));
  }
  const width = hi - lo;
  const P = heights.plate ?? DEFAULT_WALL_HEIGHT_IN;
  const type = room.attributes.ceilingType ?? 'flat';
  const ridgeLine = room.attributes.ceiling?.ridge ?? null;
  const sloped =
    (type === 'vaulted' || type === 'single_slope') &&
    ridgeLine !== null &&
    heights.ridge !== null &&
    heights.ridge > P + tol;
  const R = sloped ? heights.ridge! : P;
  const r = sloped ? Math.min(width, Math.max(0, dot(ridgeLine!.start, c) - lo)) : 0;

  /** The ceiling height at section x. */
  const h = (x: number): number => {
    if (!sloped) return P;
    if (x <= r) return r <= tol ? R : P + ((R - P) * x) / r;
    return width - r <= tol ? R : R - ((R - P) * (x - r)) / (width - r);
  };

  const profile: SectionPoint[] = [
    { x: 0, z: 0 },
    { x: 0, z: h(0) },
  ];
  if (sloped && r > tol && width - r > tol) profile.push({ x: r, z: R });
  profile.push({ x: width, z: h(width) }, { x: width, z: 0 });

  /** The band of depth `depth` under the ceiling from x0 to x1. */
  const band = (x0: number, x1: number, depth: number): SectionPoint[] => {
    const xs = [x0];
    if (sloped && r > x0 + tol && r < x1 - tol) xs.push(r);
    xs.push(x1);
    const bottom = xs.map((x) => ({ x, z: h(x) - depth }));
    const top = xs.map((x) => ({ x, z: h(x) })).reverse();
    return [...bottom, ...top];
  };

  const a = beam.attributes;
  const level = a.placement === 'level_in_vault';
  const H = a.height;
  const layout = beamLayout(beam, room);
  const beams: SectionPoint[][] = [];
  const at = (p: Point) => dot(p, c) - lo;

  if (a.direction === 'across_ridge') {
    // The cut runs along the beams: show the one nearest the set's middle (every beam has the same profile).
    const line = layout.beams[Math.floor((layout.beams.length - 1) / 2)];
    if (line !== undefined) {
      let x0 = Math.max(0, Math.min(at(line.from), at(line.to)));
      let x1 = Math.min(width, Math.max(at(line.from), at(line.to)));
      if (level) {
        // A level beam stops where its top meets the slope.
        const bottom = a.heightAff;
        const top = bottom + H;
        if (sloped && top > P) {
          const k = (top - P) / (R - P);
          x0 = Math.max(x0, r <= tol ? 0 : r * k);
          x1 = Math.min(x1, width - r <= tol ? width : width - (width - r) * k);
        }
        if (top <= R + tol && x1 - x0 > tol)
          beams.push([
            { x: x0, z: bottom },
            { x: x1, z: bottom },
            { x: x1, z: top },
            { x: x0, z: top },
          ]);
      } else if (x1 - x0 > tol) {
        beams.push(band(x0, x1, H));
      }
    }
  } else {
    // The cut crosses the beams: each shows as its W x H box.
    const w = a.width / 2;
    for (const line of layout.beams) {
      const x = at(line.from);
      const bottom = level ? a.heightAff : h(x) - H;
      beams.push([
        { x: x - w, z: bottom },
        { x: x + w, z: bottom },
        { x: x + w, z: bottom + H },
        { x: x - w, z: bottom + H },
      ]);
    }
  }

  return {
    width,
    profile,
    beams,
    plate: P,
    ridge: sloped ? R : null,
    ceiling: sloped ? null : P,
    adjoining: heights.adjoining,
    beamHeight: level ? a.heightAff : null,
  };
}

type Room = Extract<ModelObject, { type: 'room' }>;
type Wall = Extract<ModelObject, { type: 'wall' }>;

/** The section of one beam set among the model's objects; null when its room is missing. */
export function beamSetSection(beam: BeamData, objects: readonly ModelObject[]): BeamSection | null {
  const rooms = objects.filter((o): o is Room => o.type === 'room');
  const walls = objects.filter((o): o is Wall => o.type === 'wall');
  const roomId = beam.geometry.roomId.toLowerCase();
  const room = rooms.find((o) => o.id.toLowerCase() === roomId);
  if (room === undefined) return null;
  const matchId = beam.attributes.matchRoomId?.toLowerCase() ?? null;
  const matched = matchId === null ? undefined : rooms.find((o) => o.id.toLowerCase() === matchId);
  const next = matched ?? adjoiningRoom(room, rooms);
  return beamSection(beam, room.data, {
    plate: roomPlateHeight(room, walls),
    ridge: roomRidgeHeight(room.data),
    adjoining: next === null ? null : finishedCeilingHeight(next, walls),
  });
}
