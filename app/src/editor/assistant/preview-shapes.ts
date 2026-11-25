// EZD-5604b (vault/plans/EZD-5604b.md): the preview's shapes from the plan's own drawing list (section 3 G1-G4;
// Decided "D-Geometry", "D-Paths"; Q-0474 blue added, red dashed removed; Q-0638 gap 15 an update's old shape red
// dashed and its new shape blue; board S03c lines 117-137; ARCH Drawing list, one shape source). Pure, no DOM; it
// never mutates its input.
import {
  openingSpan,
  parseStoredObject,
  wallFaceLines,
  wallLength,
  type ModelObject,
  type OpeningObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { applyEditTo, makeEdit, type Objects } from '../model/patches';
import { arcPoints, planDrawingList } from '../plan/batches';
import { xy } from '../tools/overlay';
import type { OkPreview } from './apply-reply';
import { idKey, sameId } from '../shared/ids';

// G1
export type PreviewChip = {
  readonly id: string;
  readonly kind: 'wall' | 'door' | 'window';
  readonly number: number;
  readonly size: number;
  readonly at: Point;
};

type Polylines = readonly (readonly Point[])[];

export type PreviewGeometry = {
  readonly addFills: Polylines;
  readonly addLines: Polylines;
  readonly addLeaves: Polylines;
  readonly addArcs: Polylines;
  readonly removeFills: Polylines;
  readonly removeLines: Polylines;
  readonly chips: readonly PreviewChip[];
};

// G2
export type PreviewPaths = {
  readonly addFill: string;
  readonly add: string;
  readonly addLeaf: string;
  readonly addArc: string;
  readonly removeFill: string;
  readonly remove: string;
  readonly chips: readonly { id: string; x: number; y: number }[];
};

export const EMPTY_PREVIEW_PATHS: PreviewPaths = Object.freeze({
  addFill: '',
  add: '',
  addLeaf: '',
  addArc: '',
  removeFill: '',
  remove: '',
  chips: Object.freeze([]) as readonly { id: string; x: number; y: number }[],
});

// G4: the board's chip sits below the door; 36 px is the S03d chip distance.
export const PREVIEW_CHIP_OFFSET_PX = 36;

type Drawn = WallObject | OpeningObject;

function drawnObject(objects: Objects, id: string): Drawn | null {
  let key: string | undefined = objects.has(id) ? id : undefined;
  if (key === undefined) {
    for (const k of objects.keys()) {
      if (sameId(k, id)) {
        key = k;
        break;
      }
    }
  }
  if (key === undefined) return null;
  const value = objects.get(key)!;
  const r = parseStoredObject({
    id: key,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  if (!r.ok) return null;
  const o: ModelObject = r.object;
  return o.type === 'wall' || o.type === 'opening' ? o : null;
}

type Side = { fills: Point[][]; lines: Point[][]; leaves: Point[][]; arcs: Point[][] };

// One side (blue from `after`, red from `before`): each id's items in drawing-list order, then an opening's span.
function drawSide(objects: Objects, ids: readonly string[], side: Side) {
  const wanted = new Map<string, Drawn>();
  for (const id of ids) {
    const o = drawnObject(objects, id);
    if (o !== null) wanted.set(idKey(o.id), o);
  }
  if (wanted.size === 0) return;
  // EZD-6001: each object is drawn from the drawing list of its own floor.
  const levels = new Set([...wanted.values()].map((o) => idKey(o.data.level)));
  const all = [...levels].flatMap(
    (level) => planDrawingList(objects, {}, null, level)?.items ?? [],
  );
  const items = new Map<string, typeof all>();
  for (const item of all) {
    const key = idKey(item.objectId);
    if (!wanted.has(key)) continue;
    let group = items.get(key);
    if (group === undefined) items.set(key, (group = []));
    group.push(item);
  }
  for (const [key, o] of wanted) {
    const door = o.type === 'opening' && o.data.attributes.kind === 'door';
    for (const item of items.get(key) ?? []) {
      if (item.kind === 'fill') side.fills.push(item.points.map((p) => ({ ...p })));
      else if (item.kind === 'line') {
        const line = [{ ...item.from }, { ...item.to }];
        if (door) side.leaves.push(line);
        else side.lines.push(line);
      } else if (item.kind === 'arc') {
        side.arcs.push(arcPoints(item.center, item.radius, item.startAngle, item.endAngle));
      }
    }
    if (o.type === 'opening') {
      const quad = spanQuad(objects, o);
      if (quad !== null) {
        side.fills.push(quad);
        side.lines.push([...quad, { ...quad[0]! }]);
      }
    }
  }
}

function spanQuad(objects: Objects, o: OpeningObject): Point[] | null {
  const hostId = o.data.geometry.hostWallId;
  if (hostId === null) return null;
  const host = drawnObject(objects, hostId);
  if (host === null || host.type !== 'wall') return null;
  const s = openingSpan(o, host);
  if (s === null) return null;
  const { left, right } = wallFaceLines(host.data);
  const { start, end } = host.data.geometry;
  const len = wallLength(host.data.geometry);
  const d = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
  const F = (face: { start: Point }, t: number): Point => ({
    x: face.start.x + d.x * t,
    y: face.start.y + d.y * t,
  });
  return [F(left, s.lo), F(left, s.hi), F(right, s.hi), F(right, s.lo)];
}

function chipOf(o: Drawn, number: number): PreviewChip {
  if (o.type === 'wall') {
    const { start, end } = o.data.geometry;
    return {
      id: o.id,
      kind: 'wall',
      number,
      size: wallLength(o.data.geometry),
      at: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  }
  return {
    id: o.id,
    kind: o.data.attributes.kind,
    number,
    size: o.data.attributes.width,
    at: { ...o.data.geometry.center },
  };
}

// G3
export function previewGeometry(before: Objects, preview: OkPreview): PreviewGeometry {
  const after = applyEditTo(before, makeEdit(before, preview.changes), 'forward');
  const blue: Side = { fills: [], lines: [], leaves: [], arcs: [] };
  // Red draws every line and arc, a door's leaf too, as red dashed lines in drawing-list order.
  const redLines: Point[][] = [];
  const red: Side = { fills: [], lines: redLines, leaves: redLines, arcs: redLines };
  drawSide(after, [...preview.added, ...preview.updated], blue);
  drawSide(before, [...preview.removed, ...preview.updated], red);
  const chips: PreviewChip[] = [];
  for (const id of preview.added) {
    const number =
      preview.provisional[id] ??
      Object.entries(preview.provisional).find(([k]) => sameId(k, id))?.[1];
    if (number === undefined) continue;
    const o = drawnObject(after, id);
    if (o !== null) chips.push(chipOf(o, number));
  }
  return {
    addFills: blue.fills,
    addLines: blue.lines,
    addLeaves: blue.leaves,
    addArcs: blue.arcs,
    removeFills: red.fills,
    removeLines: red.lines,
    chips,
  };
}

function path(polylines: Polylines, toScreen: (p: Point) => Point, closed: boolean): string {
  return polylines
    .filter((pl) => pl.length > 0)
    .map(
      (pl) =>
        pl.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xy(toScreen(p))}`).join(' ') +
        (closed ? ' Z' : ''),
    )
    .join(' ');
}

export function previewPaths(g: PreviewGeometry, toScreen: (p: Point) => Point): PreviewPaths {
  return {
    addFill: path(g.addFills, toScreen, true),
    add: path(g.addLines, toScreen, false),
    addLeaf: path(g.addLeaves, toScreen, false),
    addArc: path(g.addArcs, toScreen, false),
    removeFill: path(g.removeFills, toScreen, true),
    remove: path(g.removeLines, toScreen, false),
    chips: g.chips.map((c) => {
      const s = toScreen(c.at);
      return { id: c.id, x: s.x, y: s.y + PREVIEW_CHIP_OFFSET_PX };
    }),
  };
}
