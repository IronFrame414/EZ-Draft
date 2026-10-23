// EZD-029 writer check (vault/plans/EZD-029.md Step 6): the writer candidate draws EZD-016b's room
// (Step 3 plan drawing) plus the spike inputs (room text, solid fill, Z-MARKUP-WP markup) in inches;
// the chosen parser reads it back (T8). Usage: node src/write-room.mjs --out <dir>
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planDrawing } from '../../../scripts/fixtures/plan-drawing.mjs';
import { room } from '../../../scripts/fixtures/room.mjs';
import { installedVersion } from './parser.mjs';
import { groupPairs } from './raw-scan.mjs';

/** The Named tools writer (docs/architecture.md DXF row). */
export const WRITER_PACKAGE = '@tarikjabiri/dxf';

const spikeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Layer name Z-MARKUP-WP: S11 Controls. Rectangle and texts: Step 6 spike inputs.
const MARKUP_LAYER = 'Z-MARKUP-WP';
const MARKUP_RECT = [
  [96, 72],
  [132, 72],
  [132, 108],
  [96, 108],
];

/**
 * Writes the room with the writer module only and returns the DXF text (synchronous).
 * @param {any} W the writer package namespace
 * @returns {string}
 */
export function writeRoom(W) {
  const dxf = new W.DxfWriter();
  dxf.setUnits(W.Units.Inches); // $INSUNITS = 1 (03 rule 5; S11 units)
  for (const name of ['WALLS', 'DOORS', 'WINDOWS', 'ROOMS', MARKUP_LAYER]) {
    dxf.addLayer(name, W.Colors.White, W.LineTypes.Continuous);
  }

  /** @type {Array<[number, number]>} */
  let roomPolygon = [];
  for (const p of planDrawing(room).primitives) {
    const opts = { layerName: p.layer };
    if (p.type === 'line') {
      dxf.addLine(W.point3d(p.a[0], p.a[1], 0), W.point3d(p.b[0], p.b[1], 0), opts);
    } else if (p.type === 'arc') {
      dxf.addArc(W.point3d(p.center[0], p.center[1], 0), p.radius, p.startDeg, p.endDeg, opts);
    } else {
      roomPolygon = p.points;
      closedPolyline(W, dxf, p.points, p.layer);
    }
  }

  dxf.addText(W.point3d(72, 60, 0), 6, 'EZD-029 ROOM', { layerName: 'ROOMS' });
  const boundary = new W.HatchBoundaryPaths();
  boundary.addPolylineBoundary(new W.HatchPolylineBoundary(roomPolygon.map(([x, y]) => W.vertex(x, y))));
  dxf.addHatch(boundary, W.pattern({ name: W.HatchPredefinedPatterns.SOLID }), { layerName: 'ROOMS' });

  closedPolyline(W, dxf, MARKUP_RECT, MARKUP_LAYER);
  dxf.addText(W.point3d(96, 112, 0), 4, 'EZD-029 MARKUP', { layerName: MARKUP_LAYER });

  return dxf.stringify();
}

/** @param {any} W @param {any} dxf @param {number[][]} points @param {string} layer */
function closedPolyline(W, dxf, points, layer) {
  dxf.addLWPolyline(
    points.map(([x, y]) => ({ point: W.point2d(x, y) })),
    { flags: W.LWPolylineFlags.Closed, layerName: layer },
  );
}

/**
 * Node built-ins imported by an installed package: every `.js`, `.mjs` and `.cjs` file outside test
 * folders is scanned for `require(` or `import` of a `module.builtinModules` name, with or without
 * `node:` (Step 6; recorded only, for 11 rule 7 and EZD-020).
 * @param {string} pkgName
 * @returns {string[]}
 */
export function nodeBuiltinsUsed(pkgName) {
  const root = path.join(spikeDir, 'node_modules', ...pkgName.split('/'));
  const names = builtinModules
    .filter((n) => !n.startsWith('_'))
    .map((n) => n.replace(/^node:/, ''))
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  const spec = `['"](?:node:)?(${names.join('|')})['"]`;
  const re = new RegExp(`(?:require\\s*\\(\\s*${spec}|\\bimport\\s*\\(\\s*${spec}|\\bfrom\\s*${spec}|\\bimport\\s+${spec})`, 'g');
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'test', 'tests', '__tests__'].includes(entry.name)) continue;
        walk(full);
      } else if (/\.(?:c|m)?js$/.test(entry.name)) {
        for (const m of readFileSync(full, 'utf8').matchAll(re)) {
          found.add(m.slice(1).find((g) => g !== undefined));
        }
      }
    }
  };
  walk(root);
  return [...found].sort();
}

/**
 * What the writer can do, recorded for EZD-913 and EZD-911 (Level-1 answers); not a pass condition.
 * Each item is read from the written file or from a small probe document.
 * @param {any} W
 * @param {string} text the room file
 */
function capabilities(W, text) {
  const pairs = groupPairs(text);
  let section = null;
  let entities = 0;
  let withHandle = 0;
  let inEntity = false;
  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i];
    if (code === 0 && value === 'SECTION') section = pairs[i + 1]?.value ?? null;
    if (section !== 'ENTITIES') continue;
    if (code === 0) {
      inEntity = !['SECTION', 'ENDSEC'].includes(value);
      if (inEntity) entities++;
    } else if (inEntity && code === 5) {
      withHandle++;
      inEntity = false;
    }
  }
  const acadVer = headerValue(pairs, '$ACADVER', 1);

  const probe = (build) => {
    const d = new W.DxfWriter();
    build(d);
    return groupPairs(d.stringify());
  };
  const lineGroups = (opts) => {
    const p = probe((d) => d.addLine(W.point3d(0, 0, 0), W.point3d(1, 0, 0), opts));
    const start = p.findIndex((g) => g.code === 0 && g.value === 'LINE');
    const end = p.findIndex((g, i) => i > start && g.code === 0);
    return p.slice(start + 1, end).map((g) => g.code);
  };

  const proto = W.DxfWriter.prototype;
  return {
    acadVer,
    handles: entities > 0 && withHandle === entities,
    blockAndInsert: typeof proto.addBlock === 'function' && typeof proto.addInsert === 'function',
    dimension: typeof proto.addLinearDim === 'function',
    patternHatches: Object.keys(W.HatchPredefinedPatterns ?? {}).filter((k) => k !== 'SOLID').length,
    colour: lineGroups({ colorNumber: 1 }).includes(62),
    lineweight: lineGroups({ lineweight: 50, lineWeight: 50 }).includes(370),
    paperSpace: typeof proto.addPaperSpace === 'function',
  };
}

/** @param {Array<{ code: number, value: string }>} pairs @param {string} name @param {number} code */
function headerValue(pairs, name, code) {
  const i = pairs.findIndex((g) => g.code === 9 && g.value === name);
  if (i < 0) return null;
  for (let j = i + 1; j < pairs.length && pairs[j].code !== 9 && pairs[j].code !== 0; j++) {
    if (pairs[j].code === code) return pairs[j].value;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  if (outIndex === -1 || !args[outIndex + 1]) {
    process.stderr.write('usage: write-room.mjs --out <dir>\n');
    process.exit(2);
  }
  const outDir = path.resolve(args[outIndex + 1]);
  mkdirSync(outDir, { recursive: true });

  const W = await import(WRITER_PACKAGE);
  const text = writeRoom(W);
  writeFileSync(path.join(outDir, 'room-written.dxf'), text);

  const writer = {
    name: WRITER_PACKAGE,
    version: installedVersion(WRITER_PACKAGE),
    fill: 'HATCH',
    text: 'TEXT',
    ...capabilities(W, text),
  };
  const nodeBuiltins = {
    'dxf-parser': nodeBuiltinsUsed('dxf-parser'),
    [WRITER_PACKAGE]: nodeBuiltinsUsed(WRITER_PACKAGE),
  };
  const resultsFile = path.join(outDir, 'results.json');
  const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {};
  results.writer = writer;
  results.nodeBuiltins = nodeBuiltins;
  writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ writer, nodeBuiltins })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
