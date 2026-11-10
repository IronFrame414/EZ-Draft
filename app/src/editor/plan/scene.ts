// EZD-207a Build step 7 (vault/plans/EZD-207a.md Decided "Grid", "Materials", "Upload rule"; C5; 11 rules 2, 4):
// the plan scene. One object per batch, re-uploaded only when its positions change, and a full-screen grid
// shader whose uniforms follow the view, so a pan or zoom rebuilds no buffer. EZD-207b Build step 5
// (vault/plans/EZD-207b.md Decided "Text material", "Text uploads", "Highlight"; C6): one text mesh on one atlas
// texture, and one translucent hover highlight; neither counts as a batch object.
// EZD-208a Build step 4 (vault/plans/EZD-208a.md section 3 A4-A5; section 1 R11): hover lines, and the selection's
// opaque fill, opening bodies and lines; none counts as a batch object.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { PlanBatch } from './batches';
import { tokenRgb } from './color';
import type { PlanTextBatch } from './glyph-atlas';
import {
  HIGHLIGHT_LINE_RENDER_ORDER,
  HIGHLIGHT_RENDER_ORDER,
  HOVER_FILL_OPACITY,
  type ObjectGeometry,
} from './hover';

export const SELECTION_FILL_RENDER_ORDER = 3.5;
export const SELECTION_LINE_RENDER_ORDER = 3.55;

export type PlanScene = {
  group: Group;
  setBatches(batches: PlanBatch[]): number;
  setGrid(g: { originX: number; originY: number; ppi: number; stepIn: number }): void;
  setViewport(v: { dpr: number; bufferHeight: number }): void;
  setAtlas(image: HTMLCanvasElement | OffscreenCanvas): void;
  setText(batch: PlanTextBatch): number;
  setHighlight(fill: Float32Array, segments?: Float32Array): number;
  setSelection(g: ObjectGeometry): number;
  objectCount(): number;
  dispose(): void;
};

const GRID_VERTEX = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const GRID_FRAGMENT = `
uniform vec2 uOrigin; uniform float uPpi; uniform float uStep; uniform float uDpr; uniform float uBufferHeight; uniform vec3 uColor;
void main() {
  vec2 css = vec2(gl_FragCoord.x, uBufferHeight - gl_FragCoord.y) / uDpr;
  vec2 m = vec2(uOrigin.x + css.x / uPpi, uOrigin.y - css.y / uPpi);
  float dx = (m.x / uStep - floor(m.x / uStep)) * uStep * uPpi;
  float dy = (ceil(m.y / uStep) - m.y / uStep) * uStep * uPpi;
  if (dx >= 1.0 && dy >= 1.0) discard;
  gl_FragColor = vec4(uColor, 1.0);
}
`;

type Entry = { object: LineSegments | Mesh; positions: Float32Array };

function samePositions(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function geometryOf(positions: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function makeObject(batch: PlanBatch): LineSegments | Mesh {
  const color = new Color().setRGB(batch.color.r, batch.color.g, batch.color.b, SRGBColorSpace);
  const geometry = geometryOf(batch.positions);
  const object =
    batch.kind === 'segments'
      ? new LineSegments(
          geometry,
          new LineBasicMaterial({ color, toneMapped: false, depthTest: false, depthWrite: false }),
        )
      : new Mesh(
          geometry,
          new MeshBasicMaterial({
            color,
            side: DoubleSide,
            toneMapped: false,
            depthTest: false,
            depthWrite: false,
          }),
        );
  object.renderOrder = batch.order;
  return object;
}

function disposeObject(object: LineSegments | Mesh): void {
  object.geometry.dispose();
  (object.material as LineBasicMaterial | MeshBasicMaterial).dispose();
}

export function createPlanScene(): PlanScene {
  const group = new Group();
  const grid = tokenRgb('--ez-canvas-grid');
  const uniforms = {
    uOrigin: { value: new Vector2(0, 0) },
    uPpi: { value: 1 },
    uStep: { value: 12 },
    uDpr: { value: 1 },
    uBufferHeight: { value: 0 },
    uColor: { value: new Vector3(grid.r, grid.g, grid.b) },
  };
  const gridMaterial = new ShaderMaterial({
    vertexShader: GRID_VERTEX,
    fragmentShader: GRID_FRAGMENT,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const gridGeometry = new PlaneGeometry(2, 2);
  const gridMesh = new Mesh(gridGeometry, gridMaterial);
  gridMesh.renderOrder = 0;
  gridMesh.frustumCulled = false;
  group.add(gridMesh);

  const entries = new Map<string, Entry>();

  let atlas: CanvasTexture<HTMLCanvasElement | OffscreenCanvas> | null = null;
  let text: { mesh: Mesh; batch: PlanTextBatch } | null = null;
  const removeText = () => {
    if (text === null) return;
    group.remove(text.mesh);
    disposeObject(text.mesh);
    text = null;
  };
  const cobalt = tokenRgb('--ez-cobalt');
  const cobaltTint = tokenRgb('--ez-cobalt-tint');
  let highlight: { mesh: Mesh; positions: Float32Array } | null = null;
  const removeHighlight = () => {
    if (highlight === null) return;
    group.remove(highlight.mesh);
    disposeObject(highlight.mesh);
    highlight = null;
  };
  let highlightLines: { object: LineSegments; positions: Float32Array } | null = null;
  const removeHighlightLines = () => {
    if (highlightLines === null) return;
    group.remove(highlightLines.object);
    disposeObject(highlightLines.object);
    highlightLines = null;
  };

  type Slot = { object: LineSegments | Mesh; positions: Float32Array } | null;
  const selection: { body: Slot; fill: Slot; segments: Slot } = {
    body: null,
    fill: null,
    segments: null,
  };
  const removeSlot = (key: keyof typeof selection) => {
    const slot = selection[key];
    if (slot === null) return;
    group.remove(slot.object);
    disposeObject(slot.object);
    selection[key] = null;
  };
  const makeSelectionObject = (
    key: keyof typeof selection,
    positions: Float32Array,
  ): LineSegments | Mesh => {
    if (key === 'segments') {
      const object = new LineSegments(
        geometryOf(positions),
        new LineBasicMaterial({
          color: new Color().setRGB(cobalt.r, cobalt.g, cobalt.b, SRGBColorSpace),
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      object.renderOrder = SELECTION_LINE_RENDER_ORDER;
      return object;
    }
    const c = key === 'body' ? cobaltTint : cobalt;
    const object = new Mesh(
      geometryOf(positions),
      new MeshBasicMaterial({
        color: new Color().setRGB(c.r, c.g, c.b, SRGBColorSpace),
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    object.renderOrder = SELECTION_FILL_RENDER_ORDER;
    return object;
  };
  const setSlot = (key: keyof typeof selection, positions: Float32Array): number => {
    const slot = selection[key];
    if (positions.length === 0) {
      if (slot === null) return 0;
      removeSlot(key);
      return 1;
    }
    if (slot === null) {
      const object = makeSelectionObject(key, positions);
      group.add(object);
      selection[key] = { object, positions };
      return 1;
    }
    if (samePositions(slot.positions, positions)) return 0;
    const old = slot.object.geometry;
    slot.object.geometry = geometryOf(positions);
    old.dispose();
    slot.positions = positions;
    return 1;
  };

  return {
    group,
    setBatches(batches) {
      let uploads = 0;
      const seen = new Set<string>();
      for (const batch of batches) {
        seen.add(batch.key);
        const entry = entries.get(batch.key);
        if (entry === undefined) {
          const object = makeObject(batch);
          group.add(object);
          entries.set(batch.key, { object, positions: batch.positions });
          uploads += 1;
        } else if (!samePositions(entry.positions, batch.positions)) {
          const old = entry.object.geometry;
          entry.object.geometry = geometryOf(batch.positions);
          old.dispose();
          entry.positions = batch.positions;
          uploads += 1;
        }
      }
      for (const [key, entry] of entries) {
        if (seen.has(key)) continue;
        group.remove(entry.object);
        disposeObject(entry.object);
        entries.delete(key);
      }
      return uploads;
    },
    setGrid(g) {
      uniforms.uOrigin.value.set(g.originX, g.originY);
      uniforms.uPpi.value = g.ppi;
      uniforms.uStep.value = g.stepIn;
    },
    setViewport(v) {
      uniforms.uDpr.value = v.dpr;
      uniforms.uBufferHeight.value = v.bufferHeight;
    },
    setAtlas(image) {
      atlas?.dispose();
      const texture = new CanvasTexture<HTMLCanvasElement | OffscreenCanvas>(image);
      texture.flipY = false;
      atlas = texture;
      if (text !== null) {
        const material = text.mesh.material as MeshBasicMaterial;
        material.alphaMap = texture;
        material.needsUpdate = true;
      }
    },
    setText(batch) {
      if (atlas === null) throw new Error('glyph atlas not set');
      if (batch.glyphs === 0) {
        removeText();
        return 0;
      }
      if (
        text !== null &&
        samePositions(text.batch.positions, batch.positions) &&
        samePositions(text.batch.uvs, batch.uvs) &&
        samePositions(text.batch.colors, batch.colors)
      ) {
        return 0;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(batch.positions, 3));
      geometry.setAttribute('uv', new BufferAttribute(batch.uvs, 2));
      geometry.setAttribute('color', new BufferAttribute(batch.colors, 3));
      if (text === null) {
        const mesh = new Mesh(
          geometry,
          new MeshBasicMaterial({
            alphaMap: atlas,
            vertexColors: true,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        mesh.renderOrder = 5;
        group.add(mesh);
        text = { mesh, batch };
      } else {
        const old = text.mesh.geometry;
        text.mesh.geometry = geometry;
        old.dispose();
        text.batch = batch;
      }
      return 1;
    },
    setHighlight(positions, segments) {
      let uploaded = 0;
      if (positions.length === 0) {
        removeHighlight();
      } else if (highlight === null || !samePositions(highlight.positions, positions)) {
        if (highlight === null) {
          const mesh = new Mesh(
            geometryOf(positions),
            new MeshBasicMaterial({
              color: new Color().setRGB(cobalt.r, cobalt.g, cobalt.b, SRGBColorSpace),
              transparent: true,
              opacity: HOVER_FILL_OPACITY,
              side: DoubleSide,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          mesh.renderOrder = HIGHLIGHT_RENDER_ORDER;
          group.add(mesh);
          highlight = { mesh, positions };
        } else {
          const old = highlight.mesh.geometry;
          highlight.mesh.geometry = geometryOf(positions);
          old.dispose();
          highlight.positions = positions;
        }
        uploaded = 1;
      }
      if (segments === undefined || segments.length === 0) {
        removeHighlightLines();
      } else if (highlightLines === null || !samePositions(highlightLines.positions, segments)) {
        if (highlightLines === null) {
          const object = new LineSegments(
            geometryOf(segments),
            new LineBasicMaterial({
              color: new Color().setRGB(cobalt.r, cobalt.g, cobalt.b, SRGBColorSpace),
              transparent: true,
              opacity: HOVER_FILL_OPACITY,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            }),
          );
          object.renderOrder = HIGHLIGHT_LINE_RENDER_ORDER;
          group.add(object);
          highlightLines = { object, positions: segments };
        } else {
          const old = highlightLines.object.geometry;
          highlightLines.object.geometry = geometryOf(segments);
          old.dispose();
          highlightLines.positions = segments;
        }
        uploaded = 1;
      }
      return uploaded;
    },
    setSelection(g) {
      const body = setSlot('body', g.body);
      const fill = setSlot('fill', g.fill);
      const segments = setSlot('segments', g.segments);
      return body + fill + segments > 0 ? 1 : 0;
    },
    objectCount() {
      return entries.size;
    },
    dispose() {
      removeText();
      removeHighlight();
      removeHighlightLines();
      removeSlot('body');
      removeSlot('fill');
      removeSlot('segments');
      atlas?.dispose();
      atlas = null;
      for (const entry of entries.values()) {
        group.remove(entry.object);
        disposeObject(entry.object);
      }
      entries.clear();
      group.remove(gridMesh);
      gridGeometry.dispose();
      gridMaterial.dispose();
    },
  };
}
