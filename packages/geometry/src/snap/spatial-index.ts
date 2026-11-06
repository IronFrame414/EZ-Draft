// EZD-206 Build step 3 (vault/plans/EZD-206.md section 1 Decided "Grid", "Query", "Bad input, index", "upsert"):
// a uniform-grid spatial index over generic ids and rectangles. Model inches.
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

export const SPATIAL_INDEX_CELL_IN = 48;

export interface SpatialIndex {
  upsert(id: string, bounds: Rect): void;
  remove(id: string): boolean;
  query(rect: Rect): string[];
  size(): number;
  lastQueryExamined(): number;
}

function validRect(r: Rect): boolean {
  return (
    Number.isFinite(r.minX) &&
    Number.isFinite(r.minY) &&
    Number.isFinite(r.maxX) &&
    Number.isFinite(r.maxY) &&
    r.minX <= r.maxX &&
    r.minY <= r.maxY
  );
}

export function createSpatialIndex(cellSizeIn: number = SPATIAL_INDEX_CELL_IN): SpatialIndex {
  if (!Number.isFinite(cellSizeIn) || cellSizeIn <= 0) {
    throw new RangeError('cell size must be a positive number');
  }
  const cell = cellSizeIn;
  const cells = new Map<string, Set<string>>();
  const entries = new Map<string, Rect>();
  let examined = 0;

  const range = (r: Rect) => ({
    cx0: Math.floor(r.minX / cell),
    cx1: Math.floor(r.maxX / cell),
    cy0: Math.floor(r.minY / cell),
    cy1: Math.floor(r.maxY / cell),
  });

  function detach(id: string, bounds: Rect): void {
    const { cx0, cx1, cy0, cy1 } = range(bounds);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = `${cx},${cy}`;
        const set = cells.get(key);
        if (!set) continue;
        set.delete(id);
        if (set.size === 0) cells.delete(key);
      }
    }
  }

  return {
    upsert(id, bounds) {
      if (!validRect(bounds)) throw new RangeError('bounds must be finite and ordered');
      const old = entries.get(id);
      if (old) detach(id, old);
      const stored = { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
      entries.set(id, stored);
      const { cx0, cx1, cy0, cy1 } = range(stored);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const key = `${cx},${cy}`;
          let set = cells.get(key);
          if (!set) {
            set = new Set<string>();
            cells.set(key, set);
          }
          set.add(id);
        }
      }
    },
    remove(id) {
      const old = entries.get(id);
      if (!old) return false;
      detach(id, old);
      entries.delete(id);
      return true;
    },
    query(rect) {
      examined = 0;
      if (!validRect(rect)) return [];
      const { cx0, cx1, cy0, cy1 } = range(rect);
      const candidates = new Set<string>();
      const covered = (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
      if (covered > cells.size) {
        for (const [key, set] of cells) {
          const comma = key.indexOf(',');
          const cx = Number(key.slice(0, comma));
          const cy = Number(key.slice(comma + 1));
          if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) continue;
          for (const id of set) candidates.add(id);
        }
      } else {
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cy = cy0; cy <= cy1; cy++) {
            const set = cells.get(`${cx},${cy}`);
            if (set) for (const id of set) candidates.add(id);
          }
        }
      }
      const hits: string[] = [];
      for (const id of candidates) {
        examined++;
        const b = entries.get(id);
        if (b && rect.minX <= b.maxX && b.minX <= rect.maxX && rect.minY <= b.maxY && b.minY <= rect.maxY) {
          hits.push(id);
        }
      }
      return hits.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    },
    size() {
      return entries.size;
    },
    lastQueryExamined() {
      return examined;
    },
  };
}
