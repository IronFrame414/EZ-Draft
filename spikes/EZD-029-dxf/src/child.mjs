// EZD-029 child process (vault/plans/EZD-029.md Step 4): reads one DXF, builds the report, prints the
// report JSON as the last stdout line. Started by run-in-limits.mjs with the function's memory cap.
// Usage: node child.mjs <file> <label>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MEMORY_MB, SECONDS, SLICE_MARGIN_SECONDS } from './limits.mjs';
import { defaultParser } from './parser.mjs';
import { detectDecoding } from './raw-scan.mjs';
import { buildReport } from './report.mjs';

const [file, label] = process.argv.slice(2);
if (!file || !label) {
  process.stderr.write('usage: child.mjs <file> <label>\n');
  process.exit(2);
}

const toMs = (/** @type {bigint} */ a, /** @type {bigint} */ b) => Number(b - a) / 1e6;

const t0 = process.hrtime.bigint();
const buf = readFileSync(file);
// Step 2 decoding: read as latin1 to find $ACADVER; AC1021 and later are decoded as UTF-8.
const latin1 = buf.toString('latin1');
const decoding = detectDecoding(latin1);
const text = decoding === 'utf8' ? buf.toString('utf8') : latin1;
const sha256 = createHash('sha256').update(buf).digest('hex');
const t1 = process.hrtime.bigint();

const report = buildReport({
  label,
  fileName: path.basename(file),
  bytes: buf.length,
  sha256,
  text,
  parser: defaultParser(),
});
const t2 = process.hrtime.bigint();

const total = toMs(t0, t2);
report.runtime.decoding = decoding;
report.runtime.limits = { seconds: SECONDS, memoryMb: MEMORY_MB };
report.timing = { readMs: toMs(t0, t1), parseMs: report.timing.parseMs, reportMs: report.timing.reportMs, ms: total };
report.memory = {
  maxRssMb: process.resourceUsage().maxRSS / 1024,
  heapUsedAfterMb: process.memoryUsage().heapUsed / (1024 * 1024),
};
// EZD-009 run budget; recorded only, a synchronous parse cannot be split across slices.
report.fitsOneSlice = total <= (SECONDS - SLICE_MARGIN_SECONDS) * 1000;

process.stdout.write(`${JSON.stringify(report)}\n`);
