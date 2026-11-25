// EZD-5604a Build step 4 (vault/plans/EZD-5604a.md section 1, Decided "D-Refusal", "D-Resolve", "D-Apply",
// "D-Wall add", "D-Opening add", "D-Attributes", "D-Equal", "D-Wall update", "D-Opening update", "D-Remove",
// "D-Result", "D-Touched", "D-Throw"; Q-0637 change format; Q-0638 gaps 9, 15; Q-0640 rows 1, 6, 7; Q-0641 rows 5, 6;
// Q-0642 row 4; AC-EZD-5604-1, -2, -6, -8, -9, -10): an Assistant reply applied in order to a scratch copy of the
// drawing through the same functions as drawing by hand. One refusal refuses the whole reply; the full save set is
// at most MAX_CHANGES_PER_SAVE. Pure: it saves nothing and never mutates its input; it never throws.
import {
  coordsEqual,
  createWallData,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DOOR_SIZE,
  DEFAULT_WINDOW_SIZE,
  endDragLength,
  moveWall,
  numberNewObjects,
  objectNumber,
  openingHostUpdates,
  openingPreview,
  parseStoredObject,
  placeOnWall,
  pointsEqual,
  raiseNumberHighs,
  resizeOpening,
  resizeWall,
  setHand,
  setImpactRating,
  setOpeningHeight,
  setRoughOpening,
  setShutterType,
  setSillHeight,
  setSwing,
  setWallBearing,
  setWallHeight,
  setWallLayer,
  setWallThickness,
  withOpeningSize,
  COMPARISON_TOLERANCE_IN,
  type ModelObject,
  type NumberHighs,
  type ObjectStatus,
  type OpeningObject,
  type Point,
  type WallLayer,
  type WallObject,
} from '@ezdraft/geometry';
import { assistantChangeSchema, type AssistantChange } from '../../lib/assistant/changes';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { MAX_CHANGES_PER_SAVE } from '../../lib/outbox/outbox';
import { withBearingNotes } from '../edit/bearing-rule';
import { deleteChanges } from '../edit/edit-changes';
import { levelModelObjects } from '../inspector/inspector-edits';
import { applyEditTo, makeEdit, type Change, type Objects } from '../model/patches';
import { openingChange, openingsOn, wallChange, wallEditChanges } from '../tools/model-changes';
import { idKey, sameId } from '../shared/ids';

export type AssistantRefusal =
  | 'unknown_ref'
  | 'duplicate_ref'
  | 'wrong_type'
  | 'other_floor'
  | 'wall_length'
  | 'join_lost'
  | 'wall_reshape'
  | 'opening_position'
  | 'invalid_value'
  | 'invalid_result'
  | 'too_many';

export type AssistantPreview =
  | {
      ok: true;
      changes: Change[];
      added: string[];
      removed: string[];
      updated: string[];
      touched: string[];
      provisional: Record<string, number>;
    }
  | { ok: false; reason: AssistantRefusal };

export type OkPreview = Extract<AssistantPreview, { ok: true }>;

export type ApplyReplyInput = {
  objects: Objects;
  floorId: string;
  changes: readonly AssistantChange[];
  refs: Readonly<Record<string, string>>;
  highs: NumberHighs;
  newId: () => string;
  // EZD-214: the phase view's status for added walls, doors, windows and the rooms they make; Existing when not given.
  status?: ObjectStatus;
};

// A refusal thrown inside one pass and caught at the top (D-Apply: the first refusal is the answer).
class Refused extends Error {
  constructor(readonly reason: AssistantRefusal) {
    super(reason);
  }
}

const refuse = (reason: AssistantRefusal): never => {
  throw new Refused(reason);
};

// D-Refusal: a callee's reason as the reply's reason.
function mapReason(reason: string): AssistantRefusal {
  switch (reason) {
    case 'zero_length':
    case 'too_long':
      return 'wall_length';
    case 'join_lost':
      return 'join_lost';
    case 'past_corner':
    case 'overlap':
    case 'not_on_wall':
      return 'opening_position';
    case 'wall_not_found':
    case 'not_found':
      return 'unknown_ref';
    default:
      return 'invalid_value';
  }
}

// Structural compare of plain stored values.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.hasOwn(rb, k) && sameJson(ra[k], rb[k]));
}

function parseValue(id: string, v: ObjectValue): ModelObject | null {
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok ? r.object : null;
}

// An unchanged object: the same value, or the same data once the sent value is read at the current version.
function sameObject(id: string, orig: ObjectValue, final: ObjectValue): boolean {
  if (sameJson(orig, final)) return true;
  if (final.schemaVersion !== CURRENT_SCHEMA_VERSION || orig.type !== final.type) return false;
  const o = parseValue(id, orig);
  return o !== null && sameJson(o.data, final.data);
}

// D-Touched.
export function touchedIds(before: Objects, changes: readonly Change[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id !== 'string' || seen.has(idKey(id))) return;
    seen.add(idKey(id));
    out.push(id);
  };
  const hostOf = (v: ObjectValue | null | undefined): unknown => {
    if (v == null || v.type !== 'opening') return null;
    const g = v.data.geometry as { hostWallId?: unknown } | undefined;
    return g?.hostWallId ?? null;
  };
  for (const c of changes) {
    add(c.id);
    add(hostOf(before.get(c.id)));
    add(hostOf(c.value));
  }
  return out;
}

type Kind = 'wall' | 'door' | 'window';

const layersEqual = (a: readonly WallLayer[], b: readonly WallLayer[]) =>
  a.length === b.length &&
  a.every((l, i) => l.material === b[i]!.material && coordsEqual(l.thickness, b[i]!.thickness));

const sizeEqual = (a: { width: number; height: number }, b: { width: number; height: number }) =>
  coordsEqual(a.width, b.width) && coordsEqual(a.height, b.height);

type WallFields = {
  start?: Point;
  end?: Point;
  thickness?: number;
  height?: number;
  bearing?: boolean;
  layers?: WallLayer[];
};

type OpeningFields = {
  center?: Point;
  width?: number;
  height?: number;
  roughOpening?: { width: number; height: number };
  sillHeight?: number;
  swing?: 'left' | 'right';
  hand?: 'left' | 'right';
  impactRating?: OpeningObject['data']['attributes']['impactRating'];
  shutterType?: NonNullable<OpeningObject['data']['attributes']['shutterType']>;
};

// D-Equal for a wall: fields equal to the sent wall are not named.
function wallNamed(c: WallFields, sent: WallObject): WallFields {
  const g = sent.data.geometry;
  const a = sent.data.attributes;
  const out: WallFields = {};
  if (c.start !== undefined && !pointsEqual(c.start, g.start)) out.start = c.start;
  if (c.end !== undefined && !pointsEqual(c.end, g.end)) out.end = c.end;
  if (c.thickness !== undefined && !coordsEqual(c.thickness, a.thickness))
    out.thickness = c.thickness;
  if (c.height !== undefined && !coordsEqual(c.height, a.height)) out.height = c.height;
  if (c.bearing !== undefined && c.bearing !== a.bearing) out.bearing = c.bearing;
  if (c.layers !== undefined && !layersEqual(c.layers, a.layers)) out.layers = c.layers;
  return out;
}

// D-Equal for a door or window.
function openingNamed(c: OpeningFields, sent: OpeningObject): OpeningFields {
  const a = sent.data.attributes;
  const out: OpeningFields = {};
  if (c.center !== undefined && !pointsEqual(c.center, sent.data.geometry.center))
    out.center = c.center;
  if (c.width !== undefined && !coordsEqual(c.width, a.width)) out.width = c.width;
  if (c.height !== undefined && !coordsEqual(c.height, a.height)) out.height = c.height;
  if (c.roughOpening !== undefined && !sizeEqual(c.roughOpening, a.roughOpening))
    out.roughOpening = c.roughOpening;
  if (c.sillHeight !== undefined && !coordsEqual(c.sillHeight, a.sillHeight))
    out.sillHeight = c.sillHeight;
  if (c.swing !== undefined && c.swing !== a.swing) out.swing = c.swing;
  if (c.hand !== undefined && c.hand !== a.hand) out.hand = c.hand;
  if (c.impactRating !== undefined && c.impactRating !== a.impactRating)
    out.impactRating = c.impactRating;
  if (c.shutterType !== undefined && c.shutterType !== a.shutterType)
    out.shutterType = c.shutterType;
  return out;
}

const hasAny = (o: object) => Object.keys(o).length > 0;

function okWall(r: { ok: true; wall: WallObject } | { ok: false; reason: string }): WallObject {
  return r.ok ? r.wall : refuse(mapReason(r.reason));
}

function okOpening(
  r: { ok: true; opening: OpeningObject } | { ok: false; reason: string },
): OpeningObject {
  return r.ok ? r.opening : refuse(mapReason(r.reason));
}

// D-Wall add (after the geometry): thickness, height, bearing, layers through the inspector's setters.
function wallAttributes(wall: WallObject, f: WallFields): WallObject {
  let w = wall;
  if (f.thickness !== undefined) w = okWall(setWallThickness(w, f.thickness));
  if (f.height !== undefined) w = okWall(setWallHeight(w, f.height));
  if (f.bearing !== undefined) w = okWall(setWallBearing(w, f.bearing));
  if (f.layers !== undefined) {
    const rows = f.layers;
    if (rows.length !== w.data.attributes.layers.length) refuse('invalid_value');
    rows.forEach((row, i) => {
      const cur = w.data.attributes.layers[i]!;
      if (row.material !== cur.material || !coordsEqual(row.thickness, cur.thickness))
        w = okWall(setWallLayer(w, i, row));
    });
  }
  return w;
}

// D-Attributes.
function openingAttributes(o: OpeningObject, f: OpeningFields): OpeningObject {
  let r = o;
  if (f.height !== undefined) r = okOpening(setOpeningHeight(r, f.height));
  if (f.sillHeight !== undefined) r = okOpening(setSillHeight(r, f.sillHeight));
  if (f.swing !== undefined) r = okOpening(setSwing(r, f.swing));
  if (f.hand !== undefined) r = okOpening(setHand(r, f.hand));
  if (f.impactRating !== undefined) r = okOpening(setImpactRating(r, f.impactRating));
  if (f.shutterType !== undefined) r = okOpening(setShutterType(r, f.shutterType));
  if (f.roughOpening !== undefined) {
    r = okOpening(setRoughOpening(r, f.roughOpening));
    r = {
      ...r,
      data: { ...r.data, attributes: { ...r.data.attributes, roughOpeningMode: 'typed' } },
    };
  }
  return r;
}

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';
const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

class Pass {
  scratch: Map<string, ObjectValue>;
  private readonly temp = new Map<string, string>();
  private readonly used = new Set<string>();
  readonly order: string[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly input: ApplyReplyInput) {
    this.scratch = new Map(input.objects);
  }

  private get floor() {
    return this.input.floorId;
  }

  private get status(): ObjectStatus {
    return this.input.status ?? 'existing';
  }

  // EZD-214 D-set_status: a sent wall, door or window on the floor; no cascade and no room reconcile (S03 Decisions
  // "Demo is set per object"; Q-0669 (a)). EZD-215 (Q-0704): a bearing wall is set to Demo with its note (`result`).
  private setStatus(c: Extract<AssistantChange, { op: 'set_status' }>) {
    const refs = this.input.refs;
    const id = Object.hasOwn(refs, c.ref) ? refs[c.ref] : undefined;
    if (typeof id !== 'string') return refuse('unknown_ref');
    const key = this.key(id);
    if (key === null) return refuse('unknown_ref');
    const v = this.scratch.get(key)!;
    if (v.type !== 'wall' && v.type !== 'opening') return refuse('wrong_type');
    const kind = v.type === 'wall' ? 'wall' : (v.data.attributes as { kind: Kind }).kind;
    this.lookup(c.ref, kind, false);
    this.used.add(c.ref);
    if (v.type === 'wall') {
      const w = this.current(key, isWall);
      if (w.data.status === c.status) return;
      this.apply([wallChange({ ...w, data: { ...w.data, status: c.status } })]);
      return;
    }
    const o = this.current(key, isOpening);
    if (o.data.status === c.status) return;
    this.apply([openingChange({ ...o, data: { ...o.data, status: c.status } })]);
  }

  level(): ModelObject[] {
    return levelModelObjects(this.scratch, this.floor);
  }

  apply(list: Change[]) {
    if (list.length === 0) return;
    this.scratch = applyEditTo(this.scratch, makeEdit(this.scratch, list), 'forward');
    for (const c of list) {
      if (this.seen.has(idKey(c.id))) continue;
      this.seen.add(idKey(c.id));
      this.order.push(c.id);
    }
  }

  private key(id: string): string | null {
    if (this.scratch.has(id)) return id;
    for (const k of this.scratch.keys()) if (sameId(k, id)) return k;
    return null;
  }

  // D-Resolve (3), (4): a sent ref (or, for a host, a ref this reply added) to the key of an object of `kind`.
  private lookup(ref: string, kind: Kind, allowTemp: boolean): string {
    const refs = this.input.refs;
    let id: string | undefined;
    if (Object.hasOwn(refs, ref)) id = refs[ref];
    else if (allowTemp) id = this.temp.get(ref);
    if (typeof id !== 'string') return refuse('unknown_ref');
    const key = this.key(id);
    if (key === null) return refuse('unknown_ref');
    const v = this.scratch.get(key)!;
    const attrs = v.data.attributes as { kind?: unknown } | undefined;
    const right =
      kind === 'wall' ? v.type === 'wall' : v.type === 'opening' && attrs?.kind === kind;
    if (!right) refuse('wrong_type');
    const level = v.data.level;
    if (typeof level !== 'string' || !sameId(level, this.floor)) refuse('other_floor');
    return key;
  }

  checkFloor() {
    const key = this.key(this.floor);
    if (key === null || this.scratch.get(key)!.type !== 'floor') refuse('other_floor');
  }

  run(c: AssistantChange) {
    if (!assistantChangeSchema.safeParse(c).success) refuse('invalid_value');
    if (this.used.has(c.ref)) refuse('duplicate_ref');
    if (c.op === 'add') {
      if (Object.hasOwn(this.input.refs, c.ref)) refuse('duplicate_ref');
      if (c.floor !== undefined) {
        const refs = this.input.refs;
        const f = Object.hasOwn(refs, c.floor) ? refs[c.floor] : undefined;
        if (typeof f !== 'string' || !sameId(f, this.floor)) refuse('other_floor');
      }
    } else if (this.temp.has(c.ref)) refuse('duplicate_ref');

    if (c.op === 'set_status') this.setStatus(c);
    else if (c.op === 'add' && c.type === 'wall') this.wallAdd(c);
    else if (c.op === 'add') this.openingAdd(c);
    else if (c.op === 'update' && c.type === 'wall') this.wallUpdate(c);
    else if (c.op === 'update') this.openingUpdate(c);
    else this.remove(c);
  }

  private sent(key: string): ModelObject {
    const v = this.input.objects.get(key);
    const o = v === undefined ? null : parseValue(key, v);
    return o ?? refuse('invalid_result');
  }

  private current<T extends ModelObject>(key: string, is: (o: ModelObject) => o is T): T {
    const o = this.level().find((x): x is T => is(x) && sameId(x.id, key));
    return o ?? refuse('invalid_result');
  }

  private wallAdd(c: Extract<AssistantChange, { op: 'add'; type: 'wall' }>) {
    const r = createWallData({
      start: c.start,
      end: c.end,
      level: this.floor,
      ...(c.thicknessSide === undefined ? {} : { thicknessSide: c.thicknessSide }),
      status: this.status,
    });
    if (!r.ok) refuse(mapReason(r.reason));
    const id = this.input.newId();
    const data = (r as Extract<typeof r, { ok: true }>).data;
    const wall = wallAttributes({ id, type: 'wall', data }, c);
    this.used.add(c.ref);
    this.temp.set(c.ref, id);
    const { newId, highs } = this.input;
    this.apply(wallEditChanges(this.scratch, this.floor, [wall], newId, highs, this.status));
  }

  private openingAdd(c: Extract<AssistantChange, { op: 'add'; type: 'door' | 'window' }>) {
    const hostKey = this.lookup(c.hostWall, 'wall', true);
    const level = this.level();
    const walls = level.filter(isWall);
    const host = walls.find((w) => sameId(w.id, hostKey)) ?? refuse('invalid_result');
    const width =
      c.width ?? (c.type === 'door' ? DEFAULT_DOOR_SIZE.width : DEFAULT_WINDOW_SIZE.width);
    if (!Number.isFinite(width) || width <= COMPARISON_TOLERANCE_IN) refuse('invalid_value');
    const p = openingPreview({
      kind: c.type,
      host,
      walls,
      openings: level.filter(isOpening),
      point: c.center,
      width,
      flipped: false,
    });
    if (!p.ok) return refuse(mapReason(p.reason));
    if (!pointsEqual(p.data.geometry.center, c.center)) refuse('opening_position');
    const id = this.input.newId();
    const placed = openingAttributes(
      { id, type: 'opening', data: { ...p.data, status: this.status } },
      c,
    );
    const highs = raiseNumberHighs(this.input.highs, this.scratch.values());
    const numbered = numberNewObjects([placed], highs).objects[0]!;
    this.used.add(c.ref);
    this.temp.set(c.ref, id);
    this.apply([openingChange(numbered)]);
  }

  private wallUpdate(c: Extract<AssistantChange, { op: 'update'; type: 'wall' }>) {
    const key = this.lookup(c.ref, 'wall', false);
    this.used.add(c.ref);
    const f = wallNamed(c, this.sent(key) as WallObject);
    if (!hasAny(f)) return;
    const cur = this.current(key, isWall);
    let changed: ModelObject[] = [];
    if (f.start !== undefined || f.end !== undefined) changed = this.reshape(cur, f);
    const target = changed.find((o): o is WallObject => isWall(o) && sameId(o.id, key)) ?? cur;
    const edited = wallAttributes(target, f);
    const walls = changed.filter(isWall).map((w) => (sameId(w.id, key) ? edited : w));
    if (!walls.some((w) => sameId(w.id, key))) walls.push(edited);
    this.apply(changed.filter(isOpening).map(openingChange));
    const { newId, highs } = this.input;
    this.apply(wallEditChanges(this.scratch, this.floor, walls, newId, highs));
  }

  // D-Wall update geometry: a move (both ends by the same distance) or one end along the wall's line.
  private reshape(cur: WallObject, f: WallFields): ModelObject[] {
    const g = cur.data.geometry;
    const s2 = f.start ?? g.start;
    const e2 = f.end ?? g.end;
    const ds = { x: s2.x - g.start.x, y: s2.y - g.start.y };
    const de = { x: e2.x - g.end.x, y: e2.y - g.end.y };
    const zero = { x: 0, y: 0 };
    if (pointsEqual(ds, de)) {
      const r = moveWall(this.level(), cur.id, ds);
      return r.ok ? r.changed : refuse(mapReason(r.reason));
    }
    let end: 'start' | 'end';
    let point: Point;
    if (pointsEqual(ds, zero)) [end, point] = ['end', e2];
    else if (pointsEqual(de, zero)) [end, point] = ['start', s2];
    else return refuse('wall_reshape');
    const r = resizeWall(this.level(), cur.id, end, endDragLength(cur, end, point));
    if (!r.ok) return refuse(mapReason(r.reason));
    const moved = r.changed.find((o): o is WallObject => isWall(o) && sameId(o.id, cur.id)) ?? cur;
    if (!pointsEqual(moved.data.geometry[end], point)) refuse('wall_reshape');
    return r.changed;
  }

  private openingUpdate(c: Extract<AssistantChange, { op: 'update'; type: 'door' | 'window' }>) {
    const key = this.lookup(c.ref, c.type, false);
    this.used.add(c.ref);
    const f = openingNamed(c, this.sent(key) as OpeningObject);
    if (!hasAny(f)) return;
    const level = this.level();
    const cur = this.current(key, isOpening);
    if (f.width !== undefined && (!Number.isFinite(f.width) || f.width <= COMPARISON_TOLERANCE_IN))
      refuse('invalid_value');
    let result = cur;
    let flaggedMove = false;
    if (f.center !== undefined) {
      const a = cur.data.attributes;
      const data = withOpeningSize(cur.data, { width: f.width ?? a.width, height: a.height });
      const cand: OpeningObject = { ...cur, data };
      const hostId = cur.data.geometry.hostWallId;
      if (hostId === null) {
        flaggedMove = true;
        result = {
          ...cand,
          data: {
            ...data,
            geometry: { ...data.geometry, center: { x: f.center.x, y: f.center.y } },
          },
        };
      } else {
        const host = level.filter(isWall).find((w) => sameId(w.id, hostId));
        if (host === undefined) return refuse('opening_position');
        const at = placeOnWall(cand, host, level, f.center);
        if (at === null || !pointsEqual(at, f.center)) refuse('opening_position');
        result = {
          ...cand,
          data: { ...data, geometry: { ...data.geometry, center: { x: at!.x, y: at!.y } } },
        };
      }
    } else if (f.width !== undefined) {
      const r = resizeOpening(level, key, f.width, 'left');
      if (!r.ok) return refuse(mapReason(r.reason));
      result = r.changed[0] ?? refuse('invalid_result');
    }
    this.apply([openingChange(openingAttributes(result, f))]);
    if (flaggedMove) {
      const walls = this.level().filter(isWall);
      const hosts = openingHostUpdates({
        level: this.floor,
        walls,
        previousWalls: walls,
        openings: openingsOn(this.scratch, this.floor),
      });
      this.apply(hosts.map(openingChange));
    }
  }

  private remove(c: Extract<AssistantChange, { op: 'remove' }>) {
    const key = this.lookup(c.ref, c.type, false);
    this.used.add(c.ref);
    this.apply(deleteChanges(this.scratch, this.floor, [key], this.input.newId));
  }
}

// D-Result.
// EZD-215 (Q-0704 "AI Accept"; Q-0638 AI remove acts as the Delete key): the change set carries the "Engineer
// required" notes it raises, so Accept saves them with the wall; they count toward MAX_CHANGES_PER_SAVE.
function result(input: ApplyReplyInput, pass: Pass): AssistantPreview {
  let changes: Change[] = [];
  for (const id of pass.order) {
    const final = pass.scratch.get(id) ?? null;
    const orig = input.objects.get(id) ?? null;
    if (final === null && orig === null) continue;
    if (final !== null && orig !== null && sameObject(id, orig, final)) continue;
    changes.push({ id, value: final });
  }
  changes = withBearingNotes(input.objects, changes, input.newId);
  for (const c of changes) {
    if (c.value !== null && parseValue(c.id, c.value) === null) refuse('invalid_result');
  }
  if (changes.length > MAX_CHANGES_PER_SAVE) refuse('too_many');
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  const provisional: Record<string, number> = {};
  for (const c of changes) {
    if (!input.objects.has(c.id)) {
      added.push(c.id);
      const n = c.value === null ? null : objectNumber(c.value);
      if (n !== null) provisional[c.id] = n;
    } else if (c.value === null) removed.push(c.id);
    else updated.push(c.id);
  }
  return {
    ok: true,
    changes,
    added,
    removed,
    updated,
    touched: touchedIds(input.objects, changes),
    provisional,
  };
}

export function applyAssistantReply(input: ApplyReplyInput): AssistantPreview {
  try {
    const pass = new Pass(input);
    pass.checkFloor();
    for (const c of input.changes) pass.run(c);
    return result(input, pass);
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason };
    return { ok: false, reason: 'invalid_result' };
  }
}
