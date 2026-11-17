// EZD-303 (phase-03 EZD-303 "toggleable mesh view"; S02 Controls "Show 3D mesh | Toggles the Polycam GLB mesh view
// to check cabinets, soffits and ceiling heights | Only when a GLB was uploaded"; 08 "Toggleable 3D underlay ...
// Reference only, never model data"): the mesh as a three.js object for the review canvas. EZD-307 mounts it and
// owns the toggle (AC-EZD-303-2 is tested there). Positions are plan inches with the same mapping as lib/imports/polycam-glb/ceiling.ts:
// x east, y north (= -glTF Z), z up (= glTF Y). The object is see-through and never picked (raycast is a no-op),
// so it stays an underlay and is never selected or edited as model data.
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { METRES_PER_INCH } from '../../lib/imports/polycam-glb/ceiling';
import type { GlbMesh } from '../../lib/imports/polycam-glb/read-glb';

export const MESH_UNDERLAY_OPACITY = 0.35;

export function meshUnderlayGeometry(mesh: GlbMesh): BufferGeometry {
  const src = mesh.triangles;
  const pos = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    pos[i] = src[i] / METRES_PER_INCH;
    pos[i + 1] = -src[i + 2] / METRES_PER_INCH;
    pos[i + 2] = src[i + 1] / METRES_PER_INCH;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.computeBoundingBox();
  return geometry;
}

/** The mesh underlay; hidden until the user turns on Show 3D mesh (set `.visible`). */
export function createMeshUnderlay(mesh: GlbMesh, color = 0x8a8a8a): Mesh {
  const object = new Mesh(
    meshUnderlayGeometry(mesh),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: MESH_UNDERLAY_OPACITY,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  object.name = 'polycam-mesh-underlay';
  object.visible = false;
  object.raycast = () => {};
  return object;
}
