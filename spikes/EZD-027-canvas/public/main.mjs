// EZD-027 page: run control, measurements, results to the screen and a file
// (vault/plans/EZD-027.md Steps 4-6). Drawn only when something changes: no requestAnimationFrame
// loop exists outside a running script (11 rule 4).
import { buildSceneData, canvasRegion } from './scene-data.mjs';
import { cameraAt, PASS_MS } from './camera-script.mjs';
import { frameStats, BUDGET_DESKTOP_MS, BUDGET_IPAD_MS, MAX_FRAME_MS } from './stats.mjs';
import { createAtlas } from './atlas.mjs';
import {
  createRenderer,
  createCamera,
  setCamera,
  buildScene,
  bufferVersionSum,
  bufferBytes,
  linePositionBytes,
  glInfo,
  contextCount,
} from './render.mjs';

const SEED = 27;
const IDLE_MS = 2000;
const params = new URLSearchParams(location.search);
const labelCount = intParam('labels', 3000, 0, 100000);
const runs = intParam('runs', 3, 1, 5);
const dprParam = Number(params.get('dpr'));
const pixelRatio = Number.isFinite(dprParam) && dprParam > 0 ? dprParam : devicePixelRatio;
const deviceLabel = params.get('device') ?? '';

const $ = (id) => document.getElementById(id);
const runButton = $('run');
const downloadButton = $('download');

let renderer;
let scene;
let camera;
let renders = 0;
let ctx = null;
let lastJson = null;
let lastStamp = null;

window.__EZD027__ = {
  renderer: null,
  scene: null,
  camera: null,
  renderCount: () => renders,
  results: null,
};

function intParam(name, fallback, min, max) {
  const v = Number(params.get(name));
  if (!params.has(name) || !Number.isInteger(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function setState(s) {
  document.documentElement.dataset.ezd027State = s;
}

function fail(err) {
  setState('error');
  $('status').textContent = `Error: ${err && err.message ? err.message : String(err)}`;
  runButton.disabled = true;
}

window.addEventListener('error', (e) => fail(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));

// The one render wrapper: every draw is counted.
function draw() {
  renderer.render(scene, camera);
  renders++;
}

function deviceSlug(label) {
  const s = String(label).toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s.length >= 1 && s.length <= 40 ? s : 'unknown';
}

function pass() {
  return new Promise((resolve) => {
    const frames = [];
    let start = null;
    const frame = (ts) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      setCamera(camera, cameraAt(elapsed));
      const c0 = performance.now();
      draw();
      const cpu = performance.now() - c0;
      const r = renderer.info.render;
      frames.push({ ts, cpu, calls: r.calls, lines: r.lines, triangles: r.triangles });
      if (elapsed >= PASS_MS) resolve(frames);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function intervals(frames) {
  const out = [];
  for (let i = 1; i < frames.length; i++) out.push(frames[i].ts - frames[i - 1].ts);
  return out;
}

function minMax(frames, key) {
  let min = Infinity;
  let max = -Infinity;
  for (const f of frames) {
    min = Math.min(min, f[key]);
    max = Math.max(max, f[key]);
  }
  return { min, max };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startLongTasks() {
  if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return null;
  const durations = [];
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) durations.push(e.duration);
  });
  obs.observe({ type: 'longtask' });
  return {
    stop() {
      for (const e of obs.takeRecords()) durations.push(e.duration);
      obs.disconnect();
      return { count: durations.length, durationsMs: durations };
    },
  };
}

function utcStamp(d) {
  return d.toISOString().replace(/[-:.]/g, '');
}

function fmt1(v) {
  return v === null || v === undefined ? '-' : v.toFixed(1);
}

function show(results) {
  const set = (name, text) => {
    document.querySelector(`[data-ezd027-stat="${name}"]`).textContent = text;
  };
  set('frames', String(results.measured.frames));
  for (const [k, v] of Object.entries(results.measured.stats)) set(k, fmt1(v));
  const dc = results.perFrame.drawCalls;
  set('drawCalls', dc.min === dc.max ? String(dc.max) : `${dc.min}-${dc.max}`);
  set('jsHeapUsedBytes', results.memory.jsHeapUsedBytes === null ? 'n/a' : String(results.memory.jsHeapUsedBytes));
  set('gpuBufferBytes', String(results.memory.gpuBufferBytes));
  set('textureBytes', String(results.memory.textureBytes));
  set('renderer', results.device.renderer);
}

async function save(json) {
  try {
    const res = await fetch('/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    if (res.status !== 201) throw new Error(String(res.status));
    const { file } = await res.json();
    $('saved').textContent = `Saved: ${file}`;
  } catch {
    $('saved').textContent = 'Not saved';
  }
}

function download() {
  if (!lastJson) return;
  const blob = new Blob([lastJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EZD-027-results-${deviceSlug(deviceLabel)}-${lastStamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

let base = null;

async function run() {
  setState('running');
  runButton.disabled = true;
  $('status').textContent = 'Running';
  $('saved').textContent = '';

  const warm = await pass();
  const versionsBefore = bufferVersionSum(scene);
  const longTasks = startLongTasks();
  const passes = [];
  for (let i = 0; i < runs; i++) passes.push(await pass());
  const longTaskResult = longTasks ? longTasks.stop() : null;
  const versionsAfter = bufferVersionSum(scene);

  const rendersBeforeIdle = renders;
  await sleep(IDLE_MS);
  const idleRenders = renders - rendersBeforeIdle;

  const allFrames = passes.flat();
  const frameIntervalsMs = passes.flatMap(intervals);
  const renderCpuMs = allFrames.map((f) => f.cpu);
  const runAt = new Date();
  const info = glInfo(renderer);
  const results = {
    schema: 1,
    ticket: 'EZD-027',
    runAt: runAt.toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    device: {
      label: deviceLabel,
      devicePixelRatio,
      pixelRatioUsed: renderer.getPixelRatio(),
      viewport: { w: innerWidth, h: innerHeight },
      canvasCss: base.canvasCss,
      drawingBuffer: info.drawingBuffer,
      webgl: 2,
      renderer: info.renderer,
      maxTextureSize: info.maxTextureSize,
      contextAttributes: info.contextAttributes,
    },
    scene: {
      seed: SEED,
      extent: base.data.extent,
      segments: base.segments,
      lineLayers: base.data.layers.length,
      symbols: base.data.symbols.length,
      symbolTypes: new Set(base.data.symbols.map((s) => s.type)).size,
      labels: base.data.labels.length,
      glyphs: base.glyphs,
      atlas: { width: base.atlas.width, height: base.atlas.height, bytesPerTexel: base.atlas.bytesPerTexel },
    },
    perFrame: {
      drawCalls: minMax(allFrames, 'calls'),
      lines: minMax(allFrames, 'lines'),
      triangles: minMax(allFrames, 'triangles'),
    },
    rendererMemory: {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    contextsCreated: contextCount(),
    canvases: document.querySelectorAll('canvas').length,
    buildMs: base.buildMs,
    firstFrameMs: base.firstFrameMs,
    warmup: { frames: warm.length, stats: frameStats(intervals(warm)) },
    measured: {
      runs,
      passMs: PASS_MS,
      frames: allFrames.length,
      frameIntervalsMs,
      renderCpuMs,
      stats: frameStats(frameIntervalsMs),
      renderCpuStats: frameStats(renderCpuMs),
    },
    buffersRebuiltDuringScript: versionsAfter - versionsBefore,
    idle: { windowMs: IDLE_MS, renders: idleRenders },
    longTasks: longTaskResult,
    memory: {
      jsHeapUsedBytes: performance.memory ? performance.memory.usedJSHeapSize : null,
      gpuBufferBytes: bufferBytes(scene),
      linePositionBytes: linePositionBytes(scene),
      textureBytes: base.atlas.width * base.atlas.height * base.atlas.bytesPerTexel,
    },
    budgetsMs: {
      desktop: Math.round(BUDGET_DESKTOP_MS * 100) / 100,
      ipad: Math.round(BUDGET_IPAD_MS * 100) / 100,
      maxFrame: MAX_FRAME_MS,
    },
  };

  window.__EZD027__.results = results;
  lastJson = JSON.stringify(results);
  lastStamp = utcStamp(runAt);
  show(results);
  downloadButton.disabled = false;
  $('status').textContent = 'Done';
  await save(lastJson);
  runButton.disabled = false;
  setState('done');
}

async function init() {
  const region = canvasRegion(innerWidth, innerHeight);
  const canvas = $('plan');
  canvas.style.left = `${region.x}px`;
  canvas.style.top = `${region.y}px`;
  canvas.style.width = `${region.width}px`;
  canvas.style.height = `${region.height}px`;

  const atlas = await createAtlas();

  const t0 = performance.now();
  const data = buildSceneData({ seed: SEED, labels: labelCount });
  renderer = createRenderer(canvas, pixelRatio);
  camera = createCamera(data.extent, region.width, region.height);
  const built = buildScene(data, atlas);
  scene = built.scene;
  const buildMs = performance.now() - t0;

  Object.assign(window.__EZD027__, { renderer, scene, camera });
  draw();
  const firstFrameMs = performance.now();

  let segments = 0;
  for (const l of data.layers) segments += l.length / 6;
  base = {
    data,
    atlas,
    glyphs: built.glyphs,
    segments,
    buildMs,
    firstFrameMs,
    canvasCss: { w: region.width, h: region.height },
  };

  runButton.addEventListener('click', () => run().catch(fail));
  downloadButton.addEventListener('click', download);
  runButton.disabled = false;
  $('status').textContent = 'Ready';
  setState('ready');
  if (params.get('autorun') === '1') run().catch(fail);
}

init().catch(fail);
