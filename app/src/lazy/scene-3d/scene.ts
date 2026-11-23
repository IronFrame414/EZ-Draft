// EZD-1001a (phase-10.md EZD-1001a; S07 Data shown, States; 11 rules 4, 6, 7; vault/spikes/EZD-030.md): the
// perspective 3D scene. Built from the editor's in-memory model store (the same routed store the plan draws, never
// a saved version) on the first open of the 3D tab, then kept current per changed object: each wall's mesh is
// cached by its id with the values it was built from (the wall and its hosted openings), and a store change
// rebuilds only the meshes whose inputs changed. Walls are their face extruded through the thickness
// (`wallSolid`, no CSG); room floors are flat at their floor level. The open floor only (Q-0776; EZD-1022 stacks
// floors). No frame loop: a change asks the shared renderer for one frame.
// EZD-504 (S05 States "walls under a slope get their top edge cut to match ... in 3D"): a wall under a single slope
// or vaulted room takes the ceiling's profile as its top (wallTopProfile). The profile is part of the wall's cache
// inputs, so a ceiling change (a room edit) rebuilds the walls under it.
// EZD-1001b (phase-10.md EZD-1001b "Meshes for flat, sloped, vaulted, tray and coffered ceilings, soffits and beams";
// S07 Data shown "ceiling slope, beams"; AC-EZD-1001b-1, -2): each room's ceiling (flat, or sloped and split at the
// ridge, with holes for its trays and coffers), each soffit, tray and coffer, and each beam set, worked out in
// geometry/scene3d/ceiling-mesh.ts. Each is cached by its own id with the derived values it was built from, so a
// change to one beam set rebuilds only that set. The ceiling parts and the beams have their own materials (the 3D
// Layers rows Ceiling and Faux beams, EZD-1005).
import {
  beamBoxes,
  boxTriangles,
  ceilingShape3d,
  liftTriangles,
  ringSides,
  roomCeiling3d,
  soffit3d,
  wallSolid,
  wallTopProfile,
  type CeilingPrism3d,
  type CeilingSurface,
  type ModelObject,
  type OpeningData,
  type Point,
  type Triangle2,
  type WallData,
  type WallSolid,
} from '@ezdraft/geometry';
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import type { Objects } from '../../editor/model/patches';
import { objectShownBy, type PhaseFilter } from '../../lib/plan/phase-view';
import { resolveOpenFloor } from '../../editor/floors/floors';
import { tokenRgb } from '../../editor/plan/color';

type Source = { getState(): { objects: Objects }; subscribe(listener: () => void): () => void };
type Watched = { subscribe(listener: () => void): () => void };

export type Scene3dStats = {
  // Meshes now in the scene, by kind.
  walls: number;
  floors: number;
  // EZD-1001b: room ceilings, soffits with trays and coffers, and beam sets.
  ceilings: number;
  ceilingParts: number;
  beams: number;
  // Meshes built since the scene was made, and the object ids rebuilt by the last change.
  built: number;
  lastRebuilt: string[];
  // Frames the renderer has drawn of this scene.
  frames: number;
};

export type Scene3d = {
  object: Group;
  camera: Camera;
  // The shared renderer gives the scene its one-frame request while the scene is shown (render-root.ts).
  setInvalidate(fn: (() => void) | null): void;
  isEmpty(): boolean;
  subscribe(listener: () => void): () => void;
  stats(): Scene3dStats;
  meshOf(id: string): Object3D | undefined;
  // EZD-1001b: a room's ceiling mesh (meshOf gives its floor).
  ceilingOf(roomId: string): Object3D | undefined;
  dispose(): void;
};

// `mesh` is null for an object that makes no mesh (a zero-length wall, an unreadable object).
type Entry = { inputs: readonly unknown[]; mesh: Mesh | null };

const v2 = ([x, y]: readonly [number, number]) => new Vector2(x, y);

function rgb(name: `--ez-${string}`): Color {
  const { r, g, b } = tokenRgb(name);
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

// 11 Budgets (editor before its lazy parts 500 KB): three is one module shared with the plan, so every three class
// this chunk names is also bundled into the editor's first download. The extrusion is therefore built here from
// classes the plan already ships (BufferGeometry, ShapeUtils' triangulation), not three's ExtrudeGeometry and Shape.
// One face loop set (an outer loop and its holes) extruded along +z by `depth`: both caps and a quad per edge.
function extrudeLoops(
  out: number[],
  outer: readonly (readonly [number, number])[],
  holes: readonly (readonly (readonly [number, number])[])[],
  depth: number,
): void {
  // The triangulation may drop a repeated closing point from these copies; its indices are into them as left.
  const contour = outer.map(v2);
  const holePoints = holes.map((h) => h.map(v2));
  const triangles = ShapeUtils.triangulateShape(contour, holePoints);
  const all = [...contour, ...holePoints.flat()];
  for (const [i, j, k] of triangles) {
    const a = all[i]!;
    const b = all[j]!;
    const c = all[k]!;
    out.push(a.x, a.y, 0, b.x, b.y, 0, c.x, c.y, 0);
    out.push(a.x, a.y, depth, c.x, c.y, depth, b.x, b.y, depth);
  }
  for (const loop of [outer, ...holes]) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i]!;
      const q = loop[(i + 1) % loop.length]!;
      out.push(p[0], p[1], 0, q[0], q[1], 0, q[0], q[1], depth);
      out.push(p[0], p[1], 0, q[0], q[1], depth, p[0], p[1], depth);
    }
  }
}

function finish(positions: number[], m: Matrix4 | null): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (m !== null) g.applyMatrix4(m);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// The face in the face frame (x along, y up) extruded along +z by the thickness, then placed: face x to `along`,
// face y to model up, face z to `through`, from the left face's start.
export function wallGeometry(solid: WallSolid): BufferGeometry {
  const f = solid.face;
  const positions: number[] = [];
  if (f.kind === 'outline') extrudeLoops(positions, f.outer, f.holes, solid.thickness);
  else if (f.kind === 'pieces') {
    for (const piece of f.pieces) extrudeLoops(positions, piece, [], solid.thickness);
  } else {
    for (const r of f.rects) {
      const loop: [number, number][] = [
        [r.x0, r.y0],
        [r.x1, r.y0],
        [r.x1, r.y1],
        [r.x0, r.y1],
      ];
      extrudeLoops(positions, loop, [], solid.thickness);
    }
  }
  const m = new Matrix4().makeBasis(
    new Vector3(solid.along.x, solid.along.y, 0),
    new Vector3(0, 0, 1),
    new Vector3(solid.through.x, solid.through.y, 0),
  );
  m.setPosition(solid.origin.x, solid.origin.y, 0);
  return finish(positions, m);
}

function floorGeometry(
  boundary: readonly { x: number; y: number }[],
  level: number,
): BufferGeometry {
  const positions: number[] = [];
  const contour = boundary.map((p) => new Vector2(p.x, p.y));
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
    for (const p of [contour[i]!, contour[j]!, contour[k]!]) positions.push(p.x, p.y, level);
  }
  return finish(positions, null);
}

// EZD-1001b: outline loops (an outer loop and its holes) triangulated in plan, as the triangles ceiling-mesh.ts lifts.
function planTriangles(outer: readonly Point[], holes: readonly (readonly Point[])[]): Triangle2[] {
  const contour = outer.map((p) => new Vector2(p.x, p.y));
  const holePoints = holes.map((h) => h.map((p) => new Vector2(p.x, p.y)));
  const all = [...contour, ...holePoints.flat()];
  return ShapeUtils.triangulateShape(contour, holePoints).map(([i, j, k]) => {
    const pt = (n: number) => ({ x: all[n]!.x, y: all[n]!.y });
    return [pt(i), pt(j), pt(k)] as const;
  });
}

const SURFACE = { kind: 'surface', offset: 0 } as const;

function ceilingGeometry(
  surface: CeilingSurface,
  outer: readonly Point[],
  holes: readonly Point[][],
): BufferGeometry {
  return finish(liftTriangles(surface, planTriangles(outer, holes), SURFACE), null);
}

// A soffit, tray or coffer: its sides, its top, and its bottom when it is closed below.
function prismGeometry(p: CeilingPrism3d): BufferGeometry {
  const positions = ringSides(p.surface, p.ring, p.bottom, p.top);
  const tris = planTriangles(p.ring, []);
  if (p.capTop) positions.push(...liftTriangles(p.surface, tris, p.top));
  if (p.capBottom) positions.push(...liftTriangles(p.surface, tris, p.bottom));
  return finish(positions, null);
}

const meshCount = (map: ReadonlyMap<string, Entry>) => {
  let n = 0;
  for (const e of map.values()) if (e.mesh !== null) n += 1;
  return n;
};

const sameInputs = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function createScene3d(o: {
  store: Source;
  phase?: (PhaseFilter & Watched) | null;
  floors?: { getState(): { chosenId: string | null } } & Watched;
}): Scene3d {
  const object = new Group();
  object.name = 'scene-3d';
  const camera = new PerspectiveCamera(50, 1, 1, 100000);
  camera.up.set(0, 0, 1);
  // Both sides drawn, so a face lights the same whichever way its triangles wind.
  const wallMaterial = new MeshLambertMaterial({ color: rgb('--ez-surface'), side: DoubleSide });
  const floorMaterial = new MeshLambertMaterial({ color: rgb('--ez-border'), side: DoubleSide });
  // EZD-1001b: ceilings, soffits, trays and coffers share one material; beams have their own (vault/build/assumptions.md
  // EZD-1001b, colours).
  const ceilingMaterial = new MeshLambertMaterial({
    color: rgb('--ez-surface-sunken'),
    side: DoubleSide,
  });
  const beamMaterial = new MeshLambertMaterial({
    color: rgb('--ez-amber-strong'),
    side: DoubleSide,
  });
  object.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(-0.4, -0.7, 1);
  object.add(sun);

  // Counts the frames drawn of this scene: an empty mesh is never drawn but is still visited each frame.
  let frames = 0;
  const probe = new Mesh(new BufferGeometry(), wallMaterial);
  probe.frustumCulled = false;
  probe.onAfterRender = () => {
    frames += 1;
  };
  object.add(probe);

  const walls = new Map<string, Entry>();
  const floors = new Map<string, Entry>();
  const ceilings = new Map<string, Entry>();
  const ceilingParts = new Map<string, Entry>();
  const beams = new Map<string, Entry>();
  let built = 0;
  let lastRebuilt: string[] = [];
  let fitted = false;
  let empty = true;
  let invalidate: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const drop = (map: Map<string, Entry>, id: string) => {
    const e = map.get(id);
    if (e === undefined) return;
    if (e.mesh !== null) {
      object.remove(e.mesh);
      e.mesh.geometry.dispose();
    }
    map.delete(id);
  };

  const put = (
    map: Map<string, Entry>,
    id: string,
    inputs: readonly unknown[],
    make: () => BufferGeometry | null,
    material: MeshLambertMaterial,
    rebuilt: string[],
  ) => {
    const e = map.get(id);
    if (e !== undefined && sameInputs(e.inputs, inputs)) return;
    drop(map, id);
    let geometry: BufferGeometry | null;
    try {
      geometry = make();
    } catch {
      // An object the mesh code cannot read is left out; the rest of the scene still draws.
      geometry = null;
    }
    // A room's floor and ceiling are both rebuilt under its one id.
    if (!rebuilt.includes(id)) rebuilt.push(id);
    if (geometry === null) {
      map.set(id, { inputs, mesh: null });
      return;
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = id;
    object.add(mesh);
    map.set(id, { inputs, mesh });
    built += 1;
  };

  // Home view for the first model with geometry: the model's box seen from the south-west, above.
  const fit = () => {
    const box = new Box3();
    for (const e of [...walls.values(), ...floors.values()])
      if (e.mesh !== null) box.union(e.mesh.geometry.boundingBox!);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const radius = Math.max(box.getSize(new Vector3()).length() / 2, 12);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    const dir = new Vector3(-0.6, -1, 0.8).normalize();
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    fitted = true;
  };

  const sync = () => {
    const objects = o.store.getState().objects;
    const level = resolveOpenFloor(objects, o.floors?.getState().chosenId ?? null);
    const phase = o.phase ?? null;
    const shown = (type: string, d: Record<string, unknown>) =>
      level !== null &&
      typeof d.level === 'string' &&
      d.level.toLowerCase() === level.toLowerCase() &&
      objectShownBy(phase, type, d.status, (d.attributes as { kind?: unknown } | undefined)?.kind);

    const wallIds = new Set<string>();
    const roomIds = new Set<string>();
    // EZD-1001b: soffits, trays and coffers (crown is trim: ceiling-mesh.ts gives it no mesh), and beam sets.
    const partIds = new Set<string>();
    const beamIds = new Set<string>();
    const hosted = new Map<string, { id: string; value: unknown }[]>();
    for (const [id, v] of objects) {
      if (v.type === 'wall' && shown('wall', v.data)) wallIds.add(id);
      else if (v.type === 'room' && shown('room', v.data)) roomIds.add(id);
      else if ((v.type === 'soffit' || v.type === 'ceiling_shape') && shown(v.type, v.data))
        partIds.add(id);
      else if (v.type === 'beam' && shown('beam', v.data)) beamIds.add(id);
      else if (v.type === 'opening' && shown('opening', v.data)) {
        const host = (v.data.geometry as { hostWallId?: unknown } | undefined)?.hostWallId;
        if (typeof host !== 'string') continue;
        const list = hosted.get(host) ?? [];
        list.push({ id, value: v });
        hosted.set(host, list);
      }
    }

    const rebuilt: string[] = [];
    for (const id of [...walls.keys()]) if (!wallIds.has(id)) drop(walls, id);
    for (const id of [...floors.keys()]) if (!roomIds.has(id)) drop(floors, id);
    for (const id of [...ceilings.keys()]) if (!roomIds.has(id)) drop(ceilings, id);
    for (const id of [...ceilingParts.keys()]) if (!partIds.has(id)) drop(ceilingParts, id);
    for (const id of [...beams.keys()]) if (!beamIds.has(id)) drop(beams, id);
    // EZD-504: the open floor's walls and rooms, read for the wall tops only when a room's ceiling is sloped.
    const sloped = [...roomIds].some((id) => {
      const a = objects.get(id)!.data.attributes as
        { ceilingType?: unknown; ceiling?: { ridge?: unknown } | null } | undefined;
      return (
        (a?.ceilingType === 'single_slope' || a?.ceilingType === 'vaulted') &&
        a.ceiling?.ridge != null
      );
    });
    // EZD-1001b: read for the ceilings too (the plate height and the tray holes) whenever there is a room.
    const levelObjects: ModelObject[] =
      roomIds.size > 0
        ? [...wallIds, ...roomIds, ...partIds].map(
            (id) =>
              ({
                id,
                type: objects.get(id)!.type,
                data: objects.get(id)!.data,
              }) as unknown as ModelObject,
          )
        : [];
    for (const id of wallIds) {
      const wall = objects.get(id)!;
      const openings = (hosted.get(id) ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
      let top: ReturnType<typeof wallTopProfile> = null;
      if (sloped) {
        try {
          top = wallTopProfile({ id, data: wall.data as unknown as WallData }, levelObjects);
        } catch {
          // A room or wall the ceiling code cannot read leaves this wall flat.
          top = null;
        }
      }
      put(
        walls,
        id,
        [wall, ...openings.map((x) => x.value), JSON.stringify(top)],
        () => {
          const solid = wallSolid(
            { data: wall.data as unknown as WallData },
            openings.map((x) => ({ data: (x.value as { data: unknown }).data as OpeningData })),
            top,
          );
          return solid === null ? null : wallGeometry(solid);
        },
        wallMaterial,
        rebuilt,
      );
    }
    for (const id of roomIds) {
      const room = objects.get(id)!;
      put(
        floors,
        id,
        [room],
        () => {
          const d = room.data as {
            geometry?: { boundary?: { x: number; y: number }[] };
            attributes?: { floorLevel?: number };
          };
          const boundary = d.geometry?.boundary;
          if (!Array.isArray(boundary) || boundary.length < 3) return null;
          return floorGeometry(boundary, d.attributes?.floorLevel ?? 0);
        },
        floorMaterial,
        rebuilt,
      );
    }
    // EZD-1001b: the ceiling parts, each keyed by the values derived for it (a room's ceiling by its outline, holes and
    // surface; a beam set by its boxes), so an edit rebuilds only the parts whose shape it changed. An object the
    // ceiling code cannot read makes no mesh.
    const derive = <T>(fn: () => T): T | null => {
      try {
        return fn();
      } catch {
        return null;
      }
    };
    const asModel = (id: string) => {
      const v = objects.get(id)!;
      return { id, type: v.type, data: v.data } as unknown as ModelObject;
    };
    const roomByLower = new Map([...roomIds].map((id) => [id.toLowerCase(), id]));
    const levelWalls = levelObjects.filter(
      (x): x is Extract<ModelObject, { type: 'wall' }> => x.type === 'wall',
    );
    for (const id of roomIds) {
      const c = derive(() =>
        roomCeiling3d(asModel(id) as Extract<ModelObject, { type: 'room' }>, levelObjects),
      );
      put(
        ceilings,
        id,
        [JSON.stringify(c)],
        () =>
          c === null || c.boundary.length < 3
            ? null
            : ceilingGeometry(c.surface, c.boundary, c.holes),
        ceilingMaterial,
        rebuilt,
      );
    }
    for (const id of partIds) {
      const x = asModel(id);
      const p = derive(() =>
        x.type === 'soffit'
          ? soffit3d(x, levelObjects)
          : x.type === 'ceiling_shape'
            ? ceilingShape3d(x, levelObjects)
            : null,
      );
      put(
        ceilingParts,
        id,
        [JSON.stringify(p)],
        () => (p === null ? null : prismGeometry(p)),
        ceilingMaterial,
        rebuilt,
      );
    }
    for (const id of beamIds) {
      const b = asModel(id) as Extract<ModelObject, { type: 'beam' }>;
      const roomId = roomByLower.get(String(b.data.geometry?.roomId ?? '').toLowerCase());
      const boxes =
        roomId === undefined
          ? null
          : derive(() =>
              beamBoxes(
                b.data,
                asModel(roomId) as Extract<ModelObject, { type: 'room' }>,
                levelWalls,
              ),
            );
      put(
        beams,
        id,
        [JSON.stringify(boxes)],
        () => (boxes === null || boxes.length === 0 ? null : finish(boxTriangles(boxes), null)),
        beamMaterial,
        rebuilt,
      );
    }
    lastRebuilt = rebuilt;
    if (!fitted) fit();
    const nowEmpty = meshCount(walls) === 0 && meshCount(floors) === 0;
    const emptyChanged = nowEmpty !== empty;
    empty = nowEmpty;
    if (rebuilt.length > 0 || emptyChanged) invalidate?.();
    if (emptyChanged) for (const l of [...listeners]) l();
  };

  // Objects that did not change keep their meshes; the store, the phase view and the open floor all re-sync.
  let lastObjects: Objects | null = null;
  const onStore = () => {
    const objects = o.store.getState().objects;
    if (objects === lastObjects) return;
    lastObjects = objects;
    sync();
  };
  const unsubs = [
    o.store.subscribe(onStore),
    o.phase?.subscribe(sync) ?? (() => {}),
    o.floors?.subscribe(sync) ?? (() => {}),
  ];
  lastObjects = o.store.getState().objects;
  sync();
  lastRebuilt = [];

  return {
    object,
    camera,
    setInvalidate(fn) {
      invalidate = fn;
    },
    isEmpty: () => empty,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stats: () => ({
      walls: meshCount(walls),
      floors: meshCount(floors),
      ceilings: meshCount(ceilings),
      ceilingParts: meshCount(ceilingParts),
      beams: meshCount(beams),
      built,
      lastRebuilt: [...lastRebuilt],
      frames,
    }),
    meshOf: (id) =>
      walls.get(id)?.mesh ??
      floors.get(id)?.mesh ??
      ceilingParts.get(id)?.mesh ??
      beams.get(id)?.mesh ??
      undefined,
    ceilingOf: (id) => ceilings.get(id)?.mesh ?? undefined,
    dispose() {
      for (const u of unsubs) u();
      for (const id of [...walls.keys()]) drop(walls, id);
      for (const id of [...floors.keys()]) drop(floors, id);
      for (const map of [ceilings, ceilingParts, beams])
        for (const id of [...map.keys()]) drop(map, id);
      probe.geometry.dispose();
      wallMaterial.dispose();
      floorMaterial.dispose();
      ceilingMaterial.dispose();
      beamMaterial.dispose();
      invalidate = null;
      listeners.clear();
    },
  };
}
