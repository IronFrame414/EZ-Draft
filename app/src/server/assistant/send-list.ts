// EZD-5602 Build step 10 (vault/plans/EZD-5602.md Decided "D-Classify", "D-Projection", "D-Label", "D-Size";
// Q-0637 send list row; Q-0638 send list additions, room label and limits rows; Q-0640; AC-EZD-5602-3, -4, -12,
// -13, -14): what the assistant sends of a drawing. Only the sent floor's walls, openings and rooms go, plus every
// floor's ref and order; each object is named by a ref (f1, w1, o1, r1), never its id. One hand-written projector
// per object type copies the 'send' fields of SEND_CLASSIFICATION; a stored field added later is unclassified until
// it is listed here (T2). No project, customer or client name is read.
// EZD-234 Build (Q-0704; vault/build/assumptions.md EZD-234): the room's floor level and photo ids are not sent, and
// the phase 10 types have a projector that sends nothing until a ticket decides what of them the assistant reads.
import {
  roomAreaSqFt,
  type ModelObject,
  type ObjectType,
  type Point,
  type WallLayer,
} from '@ezdraft/geometry';

export const ASSISTANT_DRAWING_MAX_CHARS = 400_000;

export const ROOM_LABEL_WORDS = [
  'Room',
  'Galley',
  'L-kitchen',
  '5x8',
  'Kitchen',
  'Bath',
  'Bathroom',
  'Primary',
  'Guest',
  'Master',
  'Bedroom',
  'Living',
  'Dining',
  'Laundry',
  'Garage',
  'Hall',
  'Hallway',
  'Closet',
  'Pantry',
  'Office',
  'Family',
  'Entry',
  'Foyer',
  'Utility',
  'Den',
  'Powder',
] as const;

export const SEND_CLASSIFICATION: Readonly<Record<string, 'send' | 'never'>> = {
  'floor.name': 'never',
  'floor.order': 'send',
  'wall.geometry.start.x': 'send',
  'wall.geometry.start.y': 'send',
  'wall.geometry.end.x': 'send',
  'wall.geometry.end.y': 'send',
  'wall.status': 'send',
  'wall.level': 'send',
  'wall.attributes.thickness': 'send',
  'wall.attributes.thicknessSide': 'send',
  'wall.attributes.height': 'send',
  'wall.attributes.topCutToCeiling': 'send',
  'wall.attributes.bearing': 'send',
  'wall.attributes.layers[].material': 'send',
  'wall.attributes.layers[].thickness': 'send',
  'wall.attributes.number': 'send',
  'opening.geometry.center.x': 'send',
  'opening.geometry.center.y': 'send',
  'opening.geometry.hostWallId': 'send',
  'opening.geometry.axis.x': 'never',
  'opening.geometry.axis.y': 'never',
  'opening.status': 'send',
  'opening.level': 'send',
  'opening.attributes.kind': 'send',
  'opening.attributes.width': 'send',
  'opening.attributes.height': 'send',
  'opening.attributes.roughOpening.width': 'send',
  'opening.attributes.roughOpening.height': 'send',
  'opening.attributes.sillHeight': 'send',
  'opening.attributes.number': 'send',
  'opening.attributes.swing': 'send',
  'opening.attributes.hand': 'send',
  'opening.attributes.impactRating': 'send',
  'opening.attributes.shutterType': 'send',
  'opening.attributes.roughOpeningMode': 'never',
  'room.geometry.boundary[].x': 'send',
  'room.geometry.boundary[].y': 'send',
  'room.status': 'send',
  'room.level': 'send',
  'room.attributes.name': 'send',
  'room.attributes.floorLevel': 'never',
  'room.attributes.photos[]': 'never',
  'room.closureOverride.who': 'never',
  'room.closureOverride.when': 'never',
  'room.closureOverride.gap.x': 'never',
  'room.closureOverride.gap.y': 'never',
};

type Of<T extends ObjectType> = Extract<ModelObject, { type: T }>;
type WallObject = Of<'wall'>;
type OpeningData = Of<'opening'>['data'];
type RoomData = Of<'room'>['data'];

export type SentFloor = { ref: string; order: number };

export type SentWall = {
  ref: string;
  floor: string;
  start: Point;
  end: Point;
  status: WallObject['data']['status'];
  thickness: number;
  thicknessSide: WallObject['data']['attributes']['thicknessSide'];
  height: number;
  topCutToCeiling: boolean;
  bearing: boolean;
  layers: { material: WallLayer['material']; thickness: number }[];
  number: number | null;
};

export type SentOpening = {
  ref: string;
  floor: string;
  hostWall: string | null;
  center: Point;
  status: OpeningData['status'];
  kind: OpeningData['attributes']['kind'];
  width: number;
  height: number;
  roughOpening: { width: number; height: number };
  sillHeight: number;
  swing: OpeningData['attributes']['swing'];
  hand: OpeningData['attributes']['hand'];
  impactRating: OpeningData['attributes']['impactRating'];
  shutterType: OpeningData['attributes']['shutterType'];
  number: number | null;
};

export type SentRoom = {
  ref: string;
  floor: string;
  status: RoomData['status'];
  label: string;
  boundary: Point[];
  areaSqFt: number;
};

export type SentDrawing = {
  units: 'inches';
  floor: string;
  floors: SentFloor[];
  walls: SentWall[];
  openings: SentOpening[];
  rooms: SentRoom[];
  selected: string[];
};

export type RefTable = { refOf(id: string): string | null };

const point = (p: Point): Point => ({ x: p.x, y: p.y });

const notSent = (): null => null;

// A sent object always has a ref; the place among its type is the number after the ref's letter.
const ownRef = (refs: RefTable, id: string) => refs.refOf(id) as string;

export const PROJECTORS: {
  readonly [T in ObjectType]: (o: Extract<ModelObject, { type: T }>, refs: RefTable) => unknown;
} = {
  floor: (o, refs): SentFloor => ({ ref: ownRef(refs, o.id), order: o.data.order }),
  wall: (o, refs): SentWall => {
    const a = o.data.attributes;
    return {
      ref: ownRef(refs, o.id),
      floor: ownRef(refs, o.data.level),
      start: point(o.data.geometry.start),
      end: point(o.data.geometry.end),
      status: o.data.status,
      thickness: a.thickness,
      thicknessSide: a.thicknessSide,
      height: a.height,
      topCutToCeiling: a.topCutToCeiling,
      bearing: a.bearing,
      layers: a.layers.map((l) => ({ material: l.material, thickness: l.thickness })),
      number: a.number ?? null,
    };
  },
  opening: (o, refs): SentOpening => {
    const a = o.data.attributes;
    const g = o.data.geometry;
    return {
      ref: ownRef(refs, o.id),
      floor: ownRef(refs, o.data.level),
      hostWall: g.hostWallId === null ? null : refs.refOf(g.hostWallId),
      center: point(g.center),
      status: o.data.status,
      kind: a.kind,
      width: a.width,
      height: a.height,
      roughOpening: { width: a.roughOpening.width, height: a.roughOpening.height },
      sillHeight: a.sillHeight,
      swing: a.swing,
      hand: a.hand,
      impactRating: a.impactRating,
      shutterType: a.shutterType,
      number: a.number ?? null,
    };
  },
  room: (o, refs): SentRoom => {
    const ref = ownRef(refs, o.id);
    const boundary = o.data.geometry.boundary.map(point);
    return {
      ref,
      floor: ownRef(refs, o.data.level),
      status: o.data.status,
      label: sentRoomLabel(o.data.attributes.name, Number(ref.slice(1))),
      boundary,
      areaSqFt: roomAreaSqFt(boundary),
    };
  },
  engineer_note: notSent,
  fixture: notSent,
  utility_point: notSent,
  pin: notSent,
  tile_shower: notSent,
  blocking: notSent,
  hvac: notSent,
  device: notSent,
  access: notSent,
  soffit: notSent,
  chase: notSent,
  group: notSent, // EZD-233: a group holds only member ids; nothing to send until a ticket decides
};

const LABEL_WORDS = new Set(ROOM_LABEL_WORDS.map((w) => w.toLowerCase()));

export function sentRoomLabel(name: string, n: number): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return `Room ${n}`;
  const allowed = words.every((w) => /^[0-9]+$/.test(w) || LABEL_WORDS.has(w.toLowerCase()));
  return allowed ? name : `Room ${n}`;
}

const byId = (a: { id: string }, b: { id: string }) => {
  const x = a.id.toLowerCase();
  const y = b.id.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

export function buildSentDrawing(
  objects: readonly ModelObject[],
  floorId: string,
  selectedIds: readonly string[],
): { drawing: SentDrawing; refs: Record<string, string> } | null {
  const sentFloorId = floorId.toLowerCase();
  const floors = objects.filter((o): o is Of<'floor'> => o.type === 'floor');
  if (!floors.some((f) => f.id.toLowerCase() === sentFloorId)) return null;

  const onFloor = <T extends 'wall' | 'opening' | 'room'>(type: T): Of<T>[] =>
    objects
      .filter((o): o is Of<T> => o.type === type && o.data.level.toLowerCase() === sentFloorId)
      .sort(byId);
  const sortedFloors = [...floors].sort((a, b) => a.data.order - b.data.order || byId(a, b));
  const walls = onFloor('wall');
  const openings = onFloor('opening');
  const rooms = onFloor('room');

  const refById = new Map<string, string>();
  const refs: Record<string, string> = {};
  const name = (letter: string, list: readonly { id: string }[]) =>
    list.forEach((o, i) => {
      const ref = `${letter}${i + 1}`;
      refById.set(o.id.toLowerCase(), ref);
      refs[ref] = o.id;
    });
  name('f', sortedFloors);
  name('w', walls);
  name('o', openings);
  name('r', rooms);
  const table: RefTable = { refOf: (id) => refById.get(id.toLowerCase()) ?? null };

  const selected = new Set(selectedIds.map((id) => id.toLowerCase()));
  const selectedRefs = [...walls, ...openings, ...rooms]
    .filter((o) => selected.has(o.id.toLowerCase()))
    .map((o) => table.refOf(o.id) as string);

  const drawing: SentDrawing = {
    units: 'inches',
    floor: table.refOf(sentFloorId) as string,
    floors: sortedFloors.map((f) => PROJECTORS.floor(f, table) as SentFloor),
    walls: walls.map((w) => PROJECTORS.wall(w, table) as SentWall),
    openings: openings.map((o) => PROJECTORS.opening(o, table) as SentOpening),
    rooms: rooms.map((r) => PROJECTORS.room(r, table) as SentRoom),
    selected: selectedRefs,
  };
  return { drawing, refs };
}

export function drawingTooLarge(json: string): boolean {
  return json.length > ASSISTANT_DRAWING_MAX_CHARS;
}
