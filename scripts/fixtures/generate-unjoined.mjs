// EZD-302 (Done when "The synthetic fixture with one unjoined wall scores that wall below the others"; Q-0066 (b),
// vault/plans/EZD-016b.md Depends on): the synthetic room with its east wall stopped short of the north wall.
// Written with EZD-016b's exported `room`, `planDrawing` and `writeDxf`, so nothing is copied. The east wall's two
// face lines end GAP_IN below the north wall's interior face; every other line is the synthetic room's. The gap is
// picked against EZD-302's scoring and the 1/2" tolerance (08 Imports "About 0.5" tolerance"; S02 mockup 1/2"):
// four times the tolerance, so the east wall's north end can never count as joined.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { room } from './room.mjs';
import { planDrawing } from './plan-drawing.mjs';
import { writeDxf } from './write-dxf.mjs';

export const UNJOINED_FILE = 'room-12x10-unjoined.dxf';
export const GAP_IN = 2;

/** @returns {import('./plan-drawing.mjs').Drawing} */
export function unjoinedDrawing() {
  const drawing = planDrawing(room);
  const W = room.interior.width;
  const D = room.interior.depth;
  const t = room.wallThickness;
  const primitives = drawing.primitives.map((p) => {
    if (p.layer !== 'WALLS' || p.type !== 'line') return p;
    const isEast = (x) => p.a[0] === x && p.b[0] === x;
    if (isEast(W) && p.b[1] === D) return { ...p, b: [W, D - GAP_IN] };
    if (isEast(W + t) && p.b[1] === D + t) return { ...p, b: [W + t, D - GAP_IN] };
    return p;
  });
  return { layers: drawing.layers, primitives };
}

const here = path.dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(here, '..', '..', 'fixtures', 'synthetic', UNJOINED_FILE);
  writeFileSync(out, Buffer.from(writeDxf(unjoinedDrawing()), 'latin1'));
  process.stdout.write(`${out}\n`);
}
