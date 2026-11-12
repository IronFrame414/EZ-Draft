// Thickness side of a closed chain (EZD-210a; vault/plans/EZD-210a.md Decided "closeChainSides"; Q-0569 (b);
// P203 `thicknessSideFor`; P205b CL5 (a)). Pure; returns new wall objects.
import { pointsEqual, thicknessSideFor, type WallLine, type WallObject } from '@ezdraft/geometry';

const sharesEnd = (a: WallObject, b: WallObject): boolean => {
  const p = a.data.geometry;
  const q = b.data.geometry;
  return (
    pointsEqual(p.start, q.start) ||
    pointsEqual(p.start, q.end) ||
    pointsEqual(p.end, q.start) ||
    pointsEqual(p.end, q.end)
  );
};

const copyWall = (w: WallObject, side: 'left' | 'right' | 'center'): WallObject => ({
  id: w.id,
  type: 'wall',
  data: {
    ...w.data,
    geometry: {
      start: { x: w.data.geometry.start.x, y: w.data.geometry.start.y },
      end: { x: w.data.geometry.end.x, y: w.data.geometry.end.y },
    },
    attributes: {
      ...w.data.attributes,
      thicknessSide: side,
      layers: w.data.attributes.layers.map((l) => ({ ...l })),
    },
  },
});

export function closeChainSides(walls: readonly WallObject[]): WallObject[] {
  const n = walls.length;
  if (n < 3) return [...walls];
  for (let i = 0; i < n; i++) {
    if (!sharesEnd(walls[i]!, walls[(i - 1 + n) % n]!)) return [...walls];
  }
  const forward = walls.map((w, i) => {
    const prev = walls[(i - 1 + n) % n]!.data.geometry;
    const s = w.data.geometry.start;
    return pointsEqual(s, prev.start) || pointsEqual(s, prev.end);
  });
  const oriented: WallLine[] = walls.map((w, i) => {
    const { start, end } = w.data.geometry;
    return forward[i] ? { start, end } : { start: end, end: start };
  });
  const s = thicknessSideFor({ kind: 'closed', chain: oriented });
  const opposite = s === 'left' ? 'right' : s === 'right' ? 'left' : s;
  return walls.map((w, i) => copyWall(w, forward[i] ? s : opposite));
}
