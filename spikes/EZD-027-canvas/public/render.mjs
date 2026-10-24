// EZD-027 renderer (vault/plans/EZD-027.md Step 4). One WebGLRenderer on one canvas, created once
// (11 rule 4). One LineSegments per layer, one InstancedMesh per symbol type, one instanced quad
// mesh for all text. Pan and zoom change only the camera. Colors are 04 hex values.
import * as THREE from 'three';

const BACKGROUND = '#f6f7f9'; // --ez-canvas
const LINE_COLORS = ['#14171c', '#3b424d', '#5e6672', '#7a828e', '#9aa3af'];
const SYMBOL_COLORS = ['#3b424d', '#5e6672', '#7a828e', '#9aa3af', '#c9ced5'];
const TEXT_COLOR = '#14171c';
const SYMBOL_RADIUS = 4; // inches, spike input
const GLYPH_H = 4; // inches, spike input
const LABEL_DX = 5;
const LABEL_DY = -2;

let contextsCreated = 0;
export function contextCount() {
  return contextsCreated;
}

export function createRenderer(canvas, pixelRatio) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  contextsCreated++;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(BACKGROUND, 1);
  return renderer;
}

export function createCamera(extent, cssW, cssH) {
  const scale = Math.max(extent.width / cssW, extent.height / cssH);
  const halfW = (cssW * scale) / 2;
  const halfH = (cssH * scale) / 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 1000);
  camera.position.set(extent.width / 2, extent.height / 2, 100);
  camera.updateProjectionMatrix();
  return camera;
}

export function setCamera(camera, { cx, cy, zoom }) {
  camera.position.set(cx, cy, 100);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

function polygonGeometry(sides) {
  const pts = [];
  for (let k = 0; k < sides; k++) {
    const a = (2 * Math.PI * k) / sides;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  const pos = new Float32Array((sides - 2) * 9);
  for (let k = 0; k < sides - 2; k++) {
    const tri = [pts[0], pts[k + 1], pts[k + 2]];
    for (let j = 0; j < 3; j++) {
      pos[k * 9 + j * 3] = tri[j][0];
      pos[k * 9 + j * 3 + 1] = tri[j][1];
      pos[k * 9 + j * 3 + 2] = 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

const TEXT_VERTEX = `
attribute vec2 iOffset;
attribute vec2 iUv;
uniform vec2 uGlyphSize;
uniform vec2 uCellUv;
varying vec2 vUv;
void main() {
  vec3 p = vec3(iOffset + position.xy * uGlyphSize, 0.0);
  vUv = iUv + vec2(position.x, 1.0 - position.y) * uCellUv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const TEXT_FRAGMENT = `
uniform sampler2D uAtlas;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float a = texture2D(uAtlas, vUv).a;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function textMesh(data, atlas) {
  const glyphW = GLYPH_H * atlas.cellAspect;
  let glyphs = 0;
  for (const l of data.labels) glyphs += l.length;
  const offsets = new Float32Array(glyphs * 2);
  const uvs = new Float32Array(glyphs * 2);
  const nSym = data.symbols.length;
  let g = 0;
  data.labels.forEach((label, i) => {
    const sym = data.symbols[i % nSym];
    const row = Math.floor(i / nSym);
    const x0 = sym.x + LABEL_DX;
    const y0 = sym.y + LABEL_DY - row * (GLYPH_H + 1);
    for (let c = 0; c < label.length; c++, g++) {
      const cell = atlas.cells.get(label[c]);
      offsets[g * 2] = x0 + c * glyphW;
      offsets[g * 2 + 1] = y0;
      uvs[g * 2] = cell.u;
      uvs[g * 2 + 1] = cell.v;
    }
  });
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
  );
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
  geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('iUv', new THREE.InstancedBufferAttribute(uvs, 2));
  geo.instanceCount = glyphs;

  const texture = new THREE.CanvasTexture(atlas.canvas);
  texture.flipY = false;
  const mat = new THREE.ShaderMaterial({
    vertexShader: TEXT_VERTEX,
    fragmentShader: TEXT_FRAGMENT,
    uniforms: {
      uAtlas: { value: texture },
      uColor: { value: new THREE.Color(TEXT_COLOR) },
      uGlyphSize: { value: new THREE.Vector2(glyphW, GLYPH_H) },
      uCellUv: { value: new THREE.Vector2(atlas.cellUv.u, atlas.cellUv.v) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return { mesh, glyphs };
}

export function buildScene(data, atlas) {
  const scene = new THREE.Scene();
  data.layers.forEach((positions, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: LINE_COLORS[i % LINE_COLORS.length],
      depthTest: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 0;
    scene.add(lines);
  });

  const byType = new Map();
  for (const s of data.symbols) {
    if (!byType.has(s.type)) byType.set(s.type, []);
    byType.get(s.type).push(s);
  }
  const m = new THREE.Matrix4();
  for (const [type, list] of [...byType.entries()].sort((a, b) => a[0] - b[0])) {
    const mat = new THREE.MeshBasicMaterial({
      color: SYMBOL_COLORS[type % SYMBOL_COLORS.length],
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(polygonGeometry(type + 3), mat, list.length);
    list.forEach((s, i) => {
      m.makeScale(SYMBOL_RADIUS, SYMBOL_RADIUS, 1);
      m.setPosition(s.x, s.y, 0);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  const text = textMesh(data, atlas);
  scene.add(text.mesh);

  // Every object stays drawn at every zoom, so the per-frame counts are fixed.
  scene.traverse((o) => {
    o.frustumCulled = false;
  });
  return { scene, glyphs: text.glyphs };
}

function bufferAttributes(scene) {
  const out = [];
  scene.traverse((o) => {
    if (o.geometry) {
      for (const a of Object.values(o.geometry.attributes)) out.push(a);
      if (o.geometry.index) out.push(o.geometry.index);
    }
    if (o.isInstancedMesh) out.push(o.instanceMatrix);
  });
  return out;
}

export function bufferVersionSum(scene) {
  let sum = 0;
  for (const a of bufferAttributes(scene)) sum += a.version;
  return sum;
}

export function bufferBytes(scene) {
  let sum = 0;
  for (const a of bufferAttributes(scene)) sum += a.array.byteLength;
  return sum;
}

export function linePositionBytes(scene) {
  let sum = 0;
  scene.traverse((o) => {
    if (o.isLineSegments) sum += o.geometry.attributes.position.array.byteLength;
  });
  return sum;
}

export function glInfo(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return {
    renderer: String(name),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    contextAttributes: gl.getContextAttributes(),
    drawingBuffer: { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight },
  };
}
