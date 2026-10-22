#!/usr/bin/env node
// EZD-016b Step 4.6 (vault/plans/EZD-016b.md): the synthetic fixture script.
//   node scripts/fixtures/generate-synthetic.mjs [--out <dir>]
// Default output folder fixtures/synthetic. Writes exactly the 4 fixture files and prints one JSON
// line per file (name, bytes, sha256). Exit 0 on success, 1 on any error. It never writes
// *.expected.json: those are hand-written from the plan (Step 5).
// Exports room, planDrawing and each writer so a later ticket can write a variant (Q-0066 (b)).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { room, ceilingHeight } from './room.mjs';
import { planDrawing, LAYERS } from './plan-drawing.mjs';
import { writeDxf } from './write-dxf.mjs';
import { writeVectorPdf, writeScannedPdf, buildPdf, toPaper, PAPER, BEZIER_K } from './write-pdf.mjs';
import { rasterizePlan, PX_PER_INCH } from './raster.mjs';
import { writeGlb, roomQuads, METRES_PER_INCH } from './write-glb.mjs';

export {
  room,
  ceilingHeight,
  planDrawing,
  LAYERS,
  writeDxf,
  writeVectorPdf,
  writeScannedPdf,
  buildPdf,
  toPaper,
  PAPER,
  BEZIER_K,
  rasterizePlan,
  PX_PER_INCH,
  writeGlb,
  roomQuads,
  METRES_PER_INCH,
};

export const FIXTURE_FILES = Object.freeze([
  'room-12x10.dxf',
  'room-12x10-vector.pdf',
  'room-12x10-scanned.pdf',
  'room-12x10-sloped.glb',
]);

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(here, '..', '..', 'fixtures', 'synthetic');

/**
 * Writes the 4 synthetic fixtures into outDir.
 * @param {string} outDir
 * @returns {{ name: string, bytes: number, sha256: string }[]}
 */
export function generateSynthetic(outDir) {
  const drawing = planDrawing(room);
  /** @type {[string, Buffer][]} */
  const files = [
    ['room-12x10.dxf', Buffer.from(writeDxf(drawing), 'latin1')],
    ['room-12x10-vector.pdf', writeVectorPdf(drawing)],
    ['room-12x10-scanned.pdf', writeScannedPdf(rasterizePlan(room))],
    ['room-12x10-sloped.glb', writeGlb(room)],
  ];
  mkdirSync(outDir, { recursive: true });
  return files.map(([name, data]) => {
    writeFileSync(path.join(outDir, name), data);
    return { name, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  });
}

function main() {
  const args = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = path.resolve(args[++i]);
    } else {
      throw new Error(`unknown argument: ${args[i]}`);
    }
  }
  for (const line of generateSynthetic(out)) process.stdout.write(JSON.stringify(line) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`generate-synthetic: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
