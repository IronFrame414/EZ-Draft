// EZD-207a Build step 6 (vault/plans/EZD-207a.md Decided "Drawing list", "Batches", "Colours"; 11 rule 4; ARCH
// Drawing list (EZD-238); Q-0530; Q-0558): the open floor's drawing list, merged into one vertex buffer per layer
// and kind (segments also per role), in draw order and status colour. No DOM.
import {
  buildDrawingList,
  parseStoredObject,
  type DrawingLayer,
  type DrawingList,
  type LineWeightRole,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { ShapeUtils, Vector2 } from 'three';
import type { Objects } from '../model/patches';
import { tokenRgb, type Rgb } from './color';
import type { Bounds } from './view';

export type PlanBatch = {
  key: string;
  kind: 'segments' | 'fill';
  layer: DrawingLayer;
  role: LineWeightRole | null;
  color: Rgb;
  order: number;
  positions: Float32Array;
};

export const ARC_SEGMENT_DEG = 5;
export const PLAN_DIMENSION_TEXT_PT = 10.5;
export const PLAN_ROOM_LABEL_PT = 11.25;

const LAYER_TOKEN: Record<DrawingLayer, `--ez-${string}`> = {
  existing: '--ez-slate-400',
  demo: '--ez-red',
  new: '--ez-cobalt',
  rooms: '--ez-slate-300',
  dimensions: '--ez-slate-400',
};

const STATUS_LAYERS: ReadonlySet<DrawingLayer> = new Set(['existing', 'demo', 'new']);

function parsedObjects(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, value] of objects) {
    const r = parseStoredObject({
      id,
      type: value.type,
      schema_version: value.schemaVersion,
      data: value.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

function lowestFloor(parsed: readonly ModelObject[]): string | null {
  let best: { id: string; order: number } | null = null;
  for (const o of parsed) {
    if (o.type !== 'floor') continue;
    const order = o.data.order;
    if (best === null || order < best.order || (order === best.order && o.id < best.id)) {
      best = { id: o.id, order };
    }
  }
  return best === null ? null : best.id;
}

export function openFloorId(objects: Objects): string | null {
  return lowestFloor(parsedObjects(objects));
}

export function planDrawingList(objects: Objects): DrawingList | null {
  const parsed = parsedObjects(objects);
  const level = lowestFloor(parsed);
  if (level === null) return null;
  return buildDrawingList(
    { objects: parsed },
    {
      level,
      dimensionTextPt: PLAN_DIMENSION_TEXT_PT,
      roomHatch: null,
      roomLabelPt: PLAN_ROOM_LABEL_PT,
    },
  );
}

function arcPoints(center: Point, radius: number, startAngle: number, endAngle: number): Point[] {
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  const n = Math.max(1, Math.ceil(sweep / ARC_SEGMENT_DEG));
  const points: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((startAngle + (sweep * i) / n) * Math.PI) / 180;
    points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return points;
}

type Pending = Omit<PlanBatch, 'positions'> & { values: number[] };

export function buildPlanBatches(list: DrawingList | null): PlanBatch[] {
  if (list === null) return [];
  const pending = new Map<string, Pending>();
  const target = (layer: DrawingLayer, kind: 'segments' | 'fill', role: LineWeightRole | null) => {
    const key = kind === 'fill' ? `${layer}:fill` : `${layer}:segments:${role}`;
    let batch = pending.get(key);
    if (batch === undefined) {
      const order = layer === 'dimensions' ? 4 : layer === 'rooms' ? 1 : kind === 'fill' ? 2 : 3;
      batch = { key, kind, layer, role, color: tokenRgb(LAYER_TOKEN[layer]), order, values: [] };
      pending.set(key, batch);
    }
    return batch.values;
  };
  const segment = (values: number[], a: Point, b: Point) => {
    values.push(a.x, a.y, 0, b.x, b.y, 0);
  };

  for (const item of list.items) {
    if (item.kind === 'line') {
      segment(target(item.layer, 'segments', item.role), item.from, item.to);
    } else if (item.kind === 'arc') {
      const values = target(item.layer, 'segments', item.role);
      const points = arcPoints(item.center, item.radius, item.startAngle, item.endAngle);
      for (let i = 1; i < points.length; i++) segment(values, points[i - 1], points[i]);
    } else if (item.kind === 'hatch') {
      const values = target(item.layer, 'segments', item.role);
      for (const s of item.segments) segment(values, s.from, s.to);
    } else if (item.kind === 'fill') {
      if (!STATUS_LAYERS.has(item.layer) || item.points.length < 3) continue;
      // three's triangulation calls Vector2 methods and may drop a closing point, so it gets its own copies.
      const contour = item.points.map((p) => new Vector2(p.x, p.y));
      const triangles = ShapeUtils.triangulateShape(contour, []);
      if (triangles.length === 0) continue;
      const values = target(item.layer, 'fill', null);
      for (const triangle of triangles) {
        for (const index of triangle) {
          const p = contour[index];
          values.push(p.x, p.y, 0);
        }
      }
    }
  }

  return [...pending.values()]
    .filter((b) => b.values.length > 0)
    .sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ values, ...rest }) => ({ ...rest, positions: Float32Array.from(values) }));
}

export function drawingBounds(list: DrawingList | null): Bounds | null {
  if (list === null) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const item of list.items) {
    if (item.kind === 'line') {
      add(item.from);
      add(item.to);
    } else if (item.kind === 'arc') {
      arcPoints(item.center, item.radius, item.startAngle, item.endAngle).forEach(add);
    } else if (item.kind === 'fill') {
      item.points.forEach(add);
    } else if (item.kind === 'hatch') {
      item.boundary.forEach(add);
      for (const s of item.segments) {
        add(s.from);
        add(s.to);
      }
    } else {
      add(item.at);
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
