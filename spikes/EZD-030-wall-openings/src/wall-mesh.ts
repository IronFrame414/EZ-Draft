// EZD-030 spike: extrude the wall face through its thickness with three's ExtrudeGeometry, no CSG
// (vault/plans/EZD-030.md Step 1; 11 Performance rule 6). Same wall-local frame as wall-face.ts.
import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import { wallFace } from './wall-face';
import type { WallInput } from './wall-face';

const toVectors = (points: Array<[number, number]>) => points.map(([x, y]) => new Vector2(x, y));

export function buildWallMesh(wall: WallInput): BufferGeometry {
  const face = wallFace(wall);
  const shape = new Shape(toVectors(face.outer));
  for (const hole of face.holes) shape.holes.push(new Path(toVectors(hole)));
  return new ExtrudeGeometry(shape, { depth: wall.thickness, bevelEnabled: false, steps: 1 });
}
