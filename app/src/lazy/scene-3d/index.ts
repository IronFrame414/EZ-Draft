// EZD-1001a (11 rule 7 "The 3D scene ... separate chunks"; ARCH Entry points and lazy modules `scene-3d/`): the
// perspective 3D scene and its meshes, loaded through lazyModule in ProjectEditor.tsx on the first press of the 3D
// tab. Only files in this folder build 3D meshes.
export { createScene3d, type Scene3d, type Scene3dStats } from './scene';
export { Scene3dOverlay } from './Scene3dOverlay';
