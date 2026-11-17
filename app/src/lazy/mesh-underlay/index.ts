// EZD-303 (11 Performance rule 7; ARCH Entry points and lazy modules): the Polycam mesh underlay, loaded through
// lazyModule when Show 3D mesh is first turned on (EZD-307), so three.js stays out of the review screen's entry.
export { createMeshUnderlay, meshUnderlayGeometry, MESH_UNDERLAY_OPACITY } from './mesh-underlay';
