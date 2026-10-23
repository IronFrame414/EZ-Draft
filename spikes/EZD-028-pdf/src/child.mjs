// EZD-028 child process: builds the list, writes the PDF, prints one JSON line
// (vault/plans/EZD-028.md Step 5). Started by run-in-limits.mjs with the function's memory limit.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoomList, buildStressList } from './drawing-list.mjs';
import { writePdf } from './write-pdf.mjs';

function pdfkitVersion() {
  let dir = path.dirname(fileURLToPath(import.meta.resolve('pdfkit')));
  while (dir !== path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (existsSync(file)) {
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      if (pkg.name === 'pdfkit') return pkg.version;
    }
    dir = path.dirname(dir);
  }
  return null;
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex === -1 || !args[outIndex + 1]) {
  process.stderr.write('usage: child.mjs --out <dir> [--stress]\n');
  process.exit(2);
}
const outDir = path.resolve(args[outIndex + 1]);
const stress = args.includes('--stress');
const pdf = stress ? 'EZD-028-stress.pdf' : 'EZD-028-room.pdf';

const start = process.hrtime.bigint();
const list = stress ? buildStressList() : buildRoomList();
const bytes = await writePdf(list);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, pdf), bytes);
const ms = Number(process.hrtime.bigint() - start) / 1e6;

process.stdout.write(
  `${JSON.stringify({
    ms,
    maxRssMb: process.resourceUsage().maxRSS / 1024,
    bytes: bytes.byteLength,
    execArgv: process.execArgv,
    node: process.version,
    pdfkit: pdfkitVersion(),
    pdf,
  })}\n`,
);
