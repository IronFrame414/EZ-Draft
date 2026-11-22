// EZD-313 (S02 Controls Finish import "Writes accepted items to the model as a new model version; opens 03 Plan";
// W2 step 5 "Finish: accepted items become model objects with status Existing"; S02 Decisions "Finish import
// requires every item to be resolved ... Nothing imports with a pending flag", "Finish import writes the items,
// marks step 3 done and opens 03 Plan with a short notice of the counts imported"; AC-EZD-313-2 "after Finish it
// holds only accepted items").
// The objects are built here from what the import has saved (readImportReview through the caller's client, so RLS
// decides), never from the browser: every accepted item at its fixed position (finishItems), on the project's
// first floor, status existing. A door or window keeps its host when the host wall is imported too, else it is
// off a wall (hostWallId null; it shows flagged in Plan). A room kept out of square carries its closure override.
// Each object is checked with the stored-object reader before finish_import writes them all in one transaction
// with one checkpoint (supabase/migrations/…_create_finish_cancel_import.sql).
// EZD-312: a ceiling slope is not an object of its own. An accepted slope that rises (pitch above 0) sets its room's
// ceiling type to single slope (Q-0664 room ceiling type); its heights and pitch wait for the room's ceiling data
// (EZD-501, phase 5; vault/build/assumptions.md EZD-312).
// EZD-915: an accepted supplier cabinet resolves its item but is not written (finishObjects).
import {
  autoRoughOpening,
  createWallData,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DOOR_SIZE,
  DEFAULT_WINDOW_SILL_IN,
  DEFAULT_WINDOW_SIZE,
  newRoomAttributes,
  nextRoomNumber,
  parseStoredObject,
  type ModelObject,
  type OpeningData,
  type RoomData,
  type WallData,
  type WallLayer,
} from '@ezdraft/geometry';
import { z } from 'zod';
import type { Decisions, ReviewItem } from '../../lib/imports/review';
import { finishBlocked } from '../../lib/imports/review-conflicts';
import { finishItems, type Fixes, type RoomFix } from '../../lib/imports/review-fix';
import type { Json } from '../db/database.types';
import type { DbClient } from '../storage/objects';
import { readImportReview } from './review';

export type ImportedCounts = { walls: number; windows: number; doors: number; rooms: number };

export type FinishImportResult =
  | {
      status: 'finished';
      tenantId: string;
      modelVersionId: string;
      objectIds: string[];
      sourceFileIds: string[];
      /** Accepted and deleted (rejected) items (S02 Events import.completed). */
      counts: { accepted: number; deleted: number };
      imported: ImportedCounts;
      /** Rooms written kept out of square (S02 Events room.closure_overridden). */
      overridden: { roomId: string; gapIn: number }[];
    }
  | { status: 'not_found' | 'not_ready' | 'unresolved' | 'locked' | 'closed' | 'invalid' };

/** Thrown for the refusals of finish_import and cancel_import the routes answer with 403 or 404. */
export class ImportCloseError extends Error {
  constructor(readonly code: 'permission_denied' | 'not_found' | 'invalid_input') {
    super(code);
    this.name = 'ImportCloseError';
  }
}

export function closeRpcError(error: { code?: string }): Error {
  if (error.code === '42501') return new ImportCloseError('permission_denied');
  if (error.code === 'P0002') return new ImportCloseError('not_found');
  if (error.code === '22023') return new ImportCloseError('invalid_input');
  return error as Error;
}

type Stored = {
  id: string;
  type: 'wall' | 'opening' | 'room';
  schema_version: number;
  data: unknown;
};

/**
 * Wall layers for a detected thickness: the default drywall, stud, drywall build when the thickness leaves room for
 * the two 1/2" drywall faces, else one stud layer of the whole thickness (vault/build/assumptions.md EZD-313).
 */
function layersFor(thickness: number | null, fallback: readonly WallLayer[]): WallLayer[] {
  if (thickness === null || !(thickness > 0)) return fallback.map((l) => ({ ...l }));
  if (thickness > 1) {
    return [
      { material: 'drywall', thickness: 0.5 },
      { material: 'stud', thickness: thickness - 1 },
      { material: 'drywall', thickness: 0.5 },
    ];
  }
  return [{ material: 'stud', thickness }];
}

/**
 * The stored objects Finish import writes for these accepted (and fixed) items, in detection order. Null when an
 * item cannot become a valid object (a zero-length wall, a room of fewer than three corners).
 */
export function importObjects(
  items: readonly ReviewItem[],
  fixes: Fixes,
  ctx: {
    level: string;
    appUserId: string;
    now: string;
    firstRoomNumber: number;
    newId: () => string;
  },
): { objects: Stored[]; overridden: { roomId: string; gapIn: number }[] } | null {
  const sloped = new Set(
    items.flatMap((i) =>
      i.type === 'ceiling_slope' && i.pitchPer12 > 0 && i.roomId !== null ? [i.roomId] : [],
    ),
  );
  // EZD-915: an accepted supplier cabinet is not written yet: finish_import takes walls, openings and rooms only and
  // new migrations are held by another ticket (vault/build/assumptions.md EZD-915), so it is left out here.
  const built = items.filter(
    (i): i is Exclude<ReviewItem, { type: 'ceiling_slope' | 'cabinet' }> =>
      i.type !== 'ceiling_slope' && i.type !== 'cabinet',
  );
  const ids = new Map(built.map((i) => [i.id, ctx.newId()] as const));
  const objects: Stored[] = [];
  const overridden: { roomId: string; gapIn: number }[] = [];
  let roomNumber = ctx.firstRoomNumber;
  for (const item of built) {
    const id = ids.get(item.id)!;
    let data: WallData | OpeningData | RoomData;
    if (item.type === 'wall') {
      const made = createWallData({
        start: item.geometry.start,
        end: item.geometry.end,
        level: ctx.level,
        status: 'existing',
      });
      if (!made.ok) return null;
      const layers = layersFor(item.thickness, made.data.attributes.layers);
      data = {
        ...made.data,
        attributes: {
          ...made.data.attributes,
          layers,
          thickness: layers.reduce((s, l) => s + l.thickness, 0),
          // EZD-314 (S02 Validation "Bearing walls detected or marked: flagged; later removal is blocked without
          // engineer"): a wall the import read as bearing is a bearing wall in the model (EZD-215's rule).
          ...(item.bearing === true ? { bearing: true } : {}),
        },
      };
    } else if (item.type === 'opening') {
      const door = item.kind === 'door';
      const host = item.hostWallId === null ? undefined : ids.get(item.hostWallId);
      const hostIsWall =
        host !== undefined && items.some((i) => i.id === item.hostWallId && i.type === 'wall');
      const size = {
        width: item.width,
        height: (door ? DEFAULT_DOOR_SIZE : DEFAULT_WINDOW_SIZE).height,
      };
      data = {
        geometry: {
          center: { x: item.center.x, y: item.center.y },
          hostWallId: hostIsWall ? host! : null,
          axis: null,
        },
        status: 'existing',
        level: ctx.level,
        attributes: {
          kind: item.kind,
          width: size.width,
          height: size.height,
          roughOpening: autoRoughOpening(item.kind, size),
          sillHeight: door ? 0 : DEFAULT_WINDOW_SILL_IN,
          swing: door ? 'left' : null,
          hand: door ? 'left' : null,
          impactRating: 'not_rated',
          shutterType: null,
          roughOpeningMode: 'auto',
        },
      };
    } else {
      const keep = (fixes[item.id] as RoomFix | undefined)?.keep;
      data = {
        geometry: { boundary: item.boundary.map((p) => ({ x: p.x, y: p.y })) },
        status: 'existing',
        level: ctx.level,
        attributes: {
          ...newRoomAttributes(`Room ${roomNumber}`),
          ceilingType: sloped.has(item.id) ? 'single_slope' : null,
        },
        closureOverride: keep
          ? { who: ctx.appUserId, when: ctx.now, gap: { x: keep.gap.x, y: keep.gap.y } }
          : null,
      };
      roomNumber += 1;
      if (keep) overridden.push({ roomId: id, gapIn: Math.hypot(keep.gap.x, keep.gap.y) });
    }
    const stored: Stored = {
      id,
      type: item.type,
      schema_version: CURRENT_SCHEMA_VERSION,
      data,
    };
    if (!parseStoredObject(stored).ok) return null;
    objects.push(stored);
  }
  return { objects, overridden };
}

export function importedCounts(items: readonly ReviewItem[]): ImportedCounts {
  const c: ImportedCounts = { walls: 0, windows: 0, doors: 0, rooms: 0 };
  for (const i of items) {
    if (i.type === 'wall') c.walls += 1;
    else if (i.type === 'room') c.rooms += 1;
    else if (i.type === 'ceiling_slope' || i.type === 'cabinet') continue;
    else if (i.kind === 'door') c.doors += 1;
    else c.windows += 1;
  }
  return c;
}

const payloadSchema = z.object({ sourceFileIds: z.array(z.string()).default([]) });

/** The project's live objects the import is placed against: its first floor and its rooms (for room names). */
async function readPlacement(
  client: DbClient,
  projectId: string,
): Promise<{ level: string; firstRoomNumber: number } | null> {
  const rows = await client
    .from('model_object')
    .select('object_id, type, schema_version, data')
    .eq('project_id', projectId)
    .eq('deleted', false)
    .in('type', ['floor', 'room']);
  if (rows.error) throw rows.error;
  const parsed: ModelObject[] = [];
  for (const r of rows.data) {
    const p = parseStoredObject({
      id: r.object_id,
      type: r.type,
      schema_version: r.schema_version,
      data: r.data,
    });
    if (p.ok) parsed.push(p.object);
  }
  const floors = parsed
    .flatMap((o) => (o.type === 'floor' ? [o] : []))
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
  const floor = floors[0];
  if (!floor) return null;
  return { level: floor.id, firstRoomNumber: nextRoomNumber(parsed) };
}

export async function finishImport(
  client: DbClient,
  projectId: string,
  jobId: string,
  appUserId: string,
  deps: { now?: () => Date; newId?: () => string } = {},
): Promise<FinishImportResult> {
  const review = await readImportReview(client, projectId, jobId);
  if (!review) return { status: 'not_found' };
  if (review.status === 'finished' || review.status === 'cancelled') return { status: 'closed' };
  if (review.status !== 'ready') return { status: 'not_ready' };
  const decisions: Decisions = review.decisions;
  if (finishBlocked(review.items, decisions, review.fixes, review.tolerance)) {
    return { status: 'unresolved' };
  }
  const accepted = finishItems(review.items, decisions, review.fixes);
  const placement = await readPlacement(client, projectId);
  if (!placement) return { status: 'invalid' };
  const built = importObjects(accepted, review.fixes, {
    level: placement.level,
    appUserId,
    now: (deps.now ?? (() => new Date()))().toISOString(),
    firstRoomNumber: placement.firstRoomNumber,
    newId: deps.newId ?? (() => crypto.randomUUID()),
  });
  if (!built) return { status: 'invalid' };

  const job = await client.from('job').select('payload').eq('id', jobId).maybeSingle();
  if (job.error) throw job.error;
  const payload = payloadSchema.safeParse(job.data?.payload);
  const sourceFileIds = payload.success ? payload.data.sourceFileIds : [];

  const { data, error } = await client.rpc('finish_import', {
    p_project: projectId,
    p_job: jobId,
    p_objects: built.objects as unknown as Json,
  });
  if (error) throw closeRpcError(error);
  const answer = data as {
    status?: unknown;
    tenant_id?: unknown;
    model_version_id?: unknown;
  } | null;
  const status = answer?.status;
  if (status === 'closed' || status === 'locked' || status === 'unresolved') return { status };
  if (status === 'not_ready') return { status: 'not_ready' };
  if (
    status !== 'finished' ||
    typeof answer?.tenant_id !== 'string' ||
    typeof answer.model_version_id !== 'string'
  ) {
    throw new Error('finish_import: unexpected answer');
  }
  return {
    status: 'finished',
    tenantId: answer.tenant_id,
    modelVersionId: answer.model_version_id,
    objectIds: built.objects.map((o) => o.id),
    sourceFileIds,
    counts: {
      accepted: accepted.length,
      deleted: review.items.filter((i) => decisions[i.id] === 'rejected').length,
    },
    imported: importedCounts(accepted),
    overridden: built.overridden,
  };
}
