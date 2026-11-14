// EZD-307 (S02 Controls "Show 3D mesh | Canvas, zoom stack | Toggles the Polycam GLB mesh view to check cabinets,
// soffits and ceiling heights | Only when a GLB was uploaded"; 08 "Toggleable 3D underlay ... Reference only, never
// model data"): Import review's mesh view, loaded through lazyModule on the first Show 3D mesh. It reads the GLB with
// EZD-303's reader and draws the triangles on a 2D canvas, see-through grey and lit by face, seen from the south-west
// and above; dragging turns it, the wheel zooms. Plan inches with EZD-303's mapping (x east = glTF X, y north =
// -glTF Z, z up = glTF Y). No three.js: a lazy chunk sharing three.js with the editor made the bundler split the
// editor's chunks and put the editor route over its 500 KB budget (11 Budgets; vault/build/assumptions.md EZD-307).
// It is drawn only, never picked or edited.
import { METRES_PER_INCH } from '../../lib/imports/polycam-glb/ceiling';
import { readGlb, type GlbMesh } from '../../lib/imports/polycam-glb/read-glb';

/** See-through like EZD-303's underlay (MESH_UNDERLAY_OPACITY 0.35). */
export const MESH_VIEW_OPACITY = 0.35;

export type MeshView = {
  readonly triangleCount: number;
  /** Whether the mesh is drawn; Show 3D mesh flips it. */
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  dispose(): void;
};

export async function fetchGlb(url: string, fetchImpl: typeof fetch = fetch): Promise<GlbMesh> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`mesh download failed: ${res.status}`);
  return readGlb(new Uint8Array(await res.arrayBuffer()));
}

/** Triangle corners in plan inches: 9 numbers per triangle (x east, y north, z up). */
export function planInches(mesh: GlbMesh): Float64Array {
  const src = mesh.triangles;
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i] / METRES_PER_INCH;
    out[i + 1] = -src[i + 2] / METRES_PER_INCH;
    out[i + 2] = src[i + 1] / METRES_PER_INCH;
  }
  return out;
}

export function createMeshView(canvas: HTMLCanvasElement, mesh: GlbMesh): MeshView {
  const pts = planInches(mesh);
  const n = mesh.triangleCount;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
    minZ = Math.min(minZ, pts[i + 2]);
    maxZ = Math.max(maxZ, pts[i + 2]);
  }
  const cx = n > 0 ? (minX + maxX) / 2 : 0;
  const cy = n > 0 ? (minY + maxY) / 2 : 0;
  const cz = n > 0 ? (minZ + maxZ) / 2 : 0;
  const reach = n > 0 ? Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) : 1;

  let visible = false;
  // Seen from the south-west and above.
  let yaw = -Math.PI / 4;
  let pitch = Math.PI / 5;
  let zoom = 1;
  const order = new Uint32Array(n);
  const depth = new Float64Array(n);
  const sx = new Float64Array(pts.length / 3);
  const sy = new Float64Array(pts.length / 3);

  const draw = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!visible) return;
    const scale = (0.8 * Math.min(w, h) * zoom) / reach;
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // View axes: right = (cos yaw, sin yaw, 0) turned so yaw -45° looks north-east; depth along the view.
    for (let v = 0; v < sx.length; v++) {
      const x = pts[v * 3] - cx;
      const y = pts[v * 3 + 1] - cy;
      const z = pts[v * 3 + 2] - cz;
      const right = x * cyaw + y * syaw;
      const fwd = -x * syaw + y * cyaw;
      const up = z * cp - fwd * sp;
      sx[v] = w / 2 + right * scale;
      sy[v] = h / 2 - up * scale;
    }
    for (let t = 0; t < n; t++) {
      order[t] = t;
      let d = 0;
      for (let k = 0; k < 3; k++) {
        const v = t * 3 + k;
        const x = pts[v * 3] - cx;
        const y = pts[v * 3 + 1] - cy;
        const z = pts[v * 3 + 2] - cz;
        const fwd = -x * syaw + y * cyaw;
        d += fwd * cp + z * sp;
      }
      depth[t] = d;
    }
    // Far first (painter's order).
    order.sort((a, b) => depth[b] - depth[a]);
    ctx.lineWidth = 0.5;
    for (const t of order) {
      const a = t * 3;
      const ax = pts[a * 3];
      const ay = pts[a * 3 + 1];
      const az = pts[a * 3 + 2];
      const ux = pts[(a + 1) * 3] - ax;
      const uy = pts[(a + 1) * 3 + 1] - ay;
      const uz = pts[(a + 1) * 3 + 2] - az;
      const vx = pts[(a + 2) * 3] - ax;
      const vy = pts[(a + 2) * 3 + 1] - ay;
      const vz = pts[(a + 2) * 3 + 2] - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      // Light from above and the south-west; faces either way are lit alike.
      const lit = Math.abs((nx * -0.4 + ny * -0.4 + nz * 0.82) / len);
      const shade = Math.round(110 + 110 * lit);
      ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 6}, ${MESH_VIEW_OPACITY})`;
      ctx.strokeStyle = `rgba(90, 96, 106, ${MESH_VIEW_OPACITY})`;
      ctx.beginPath();
      ctx.moveTo(sx[a], sy[a]);
      ctx.lineTo(sx[a + 1], sy[a + 1]);
      ctx.lineTo(sx[a + 2], sy[a + 2]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  let dragging: { x: number; y: number; yaw: number; pitch: number } | null = null;
  const down = (e: PointerEvent) => {
    dragging = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    yaw = dragging.yaw - (e.clientX - dragging.x) * 0.01;
    pitch = Math.min(
      Math.PI / 2,
      Math.max(-Math.PI / 2, dragging.pitch + (e.clientY - dragging.y) * 0.01),
    );
    draw();
  };
  const up = () => {
    dragging = null;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zoom = Math.min(20, Math.max(0.1, zoom * Math.exp(-e.deltaY * 0.0015)));
    draw();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(canvas);

  return {
    triangleCount: n,
    get visible() {
      return visible;
    },
    setVisible(next: boolean) {
      visible = next;
      draw();
    },
    dispose() {
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    },
  };
}
