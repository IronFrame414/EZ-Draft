// EZD-602 (S06 Controls "Canvas drag device | Canvas | Moves device; live distances."; Q-0630 row 10 chips "Wall:
// nearest parallel wall face each side"; vault/build/assumptions.md EZD-602): the live distances of one dragged
// electrical device, drawn as the wall chips are. Left: the nearest wall face the device's point reaches square
// on. Right: the nearest face, reached square on, of a wall crossing that one (not parallel to it), so a
// receptacle shows its distance off the wall and along it to the corner. Ties go to the lower wall id.
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, coordsEqual } from '../tolerance';
import { wallFaceLines, wallLength, type WallObject } from '../walls/wall';
import type { ChipSide, WallChip } from './chips';

const tol = COMPARISON_TOLERANCE_IN;
const lower = (id: string) => id.toLowerCase();

export function deviceChips(objects: readonly ModelObject[], deviceId: string): WallChip[] {
  const o = objects.find((x) => x.type === 'device' && lower(x.id) === lower(deviceId));
  if (o === undefined || o.type !== 'device') return [];
  const p = o.data.geometry.point;
  type Hit = { distance: number; wallId: string; to: Point; dir: Point };
  const hits: Hit[] = [];
  for (const w of objects) {
    if (w.type !== 'wall' || lower(w.data.level) !== lower(o.data.level)) continue;
    if (wallLength((w as WallObject).data.geometry) <= tol) continue;
    const faces = wallFaceLines(w.data);
    for (const face of [faces.left, faces.right]) {
      const dx = face.end.x - face.start.x;
      const dy = face.end.y - face.start.y;
      const len2 = dx * dx + dy * dy;
      if (len2 <= tol * tol) continue;
      const t = ((p.x - face.start.x) * dx + (p.y - face.start.y) * dy) / len2;
      if (t < 0 || t > 1) continue;
      const to = { x: face.start.x + t * dx, y: face.start.y + t * dy };
      const len = Math.sqrt(len2);
      hits.push({
        distance: Math.hypot(p.x - to.x, p.y - to.y),
        wallId: w.id,
        to,
        dir: { x: dx / len, y: dy / len },
      });
    }
  }
  const order = (a: Hit, b: Hit) =>
    coordsEqual(a.distance, b.distance)
      ? lower(a.wallId) < lower(b.wallId)
        ? -1
        : lower(a.wallId) > lower(b.wallId)
          ? 1
          : 0
      : a.distance - b.distance;
  hits.sort(order);
  const first = hits[0];
  if (first === undefined) return [];
  const chip = (side: ChipSide, h: Hit): WallChip => ({
    kind: 'wall',
    side,
    distance: h.distance,
    neighborId: h.wallId,
    from: { x: p.x, y: p.y },
    to: h.to,
  });
  const crossing = hits.find((h) => Math.abs(h.dir.x * first.dir.y - h.dir.y * first.dir.x) > 0.5);
  return crossing === undefined
    ? [chip('left', first)]
    : [chip('left', first), chip('right', crossing)];
}
