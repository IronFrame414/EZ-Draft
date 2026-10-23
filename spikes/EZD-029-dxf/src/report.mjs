// EZD-029 report (vault/plans/EZD-029.md Step 3): raw scan, then the parser, then the comparison.
// not read = raw count - parsed count, per type, for ENTITIES and BLOCKS (R26 R16). The report holds
// counts, type names, layer names, sizes and times only, never text values.
import { rawScan } from './raw-scan.mjs';

/** @param {Record<string, number>} map @param {string} key @param {number} [n] */
function add(map, key, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

const ms = (/** @type {bigint} */ a, /** @type {bigint} */ b) => Number(b - a) / 1e6;

/**
 * Counts of what the parser returned (Step 3 "Parsed counts").
 * @param {any} dxf
 */
function parsedCounts(dxf) {
  /** @type {any[]} */
  const entities = dxf.entities ?? [];
  const byType = {};
  const byLayer = {};
  let paperSpace = 0;
  for (const e of entities) {
    add(byType, e.type);
    add(byLayer, e.layer ?? '0');
    if (e.inPaperSpace === true) paperSpace++;
  }
  const blocks = { count: 0, entities: 0, byBlock: {}, byType: {} };
  /** @type {any[]} */
  const blockEntities = [];
  for (const [name, block] of Object.entries(dxf.blocks ?? {})) {
    const list = /** @type {any} */ (block).entities ?? [];
    blocks.count++;
    blocks.entities += list.length;
    blocks.byBlock[name] = list.length;
    for (const e of list) {
      add(blocks.byType, e.type);
      blockEntities.push(e);
    }
  }
  const all = [...entities, ...blockEntities];
  // dxf-parser numbers an entity that has no group 5 itself; a file handle is a string (code 5).
  const handles = all.length > 0 && all.every((e) => typeof e.handle === 'string');
  return { total: entities.length, byType, byLayer, paperSpace, blocks, handles };
}

/**
 * @param {Record<string, number>} raw
 * @param {Record<string, number>} parsed
 */
function compare(raw, parsed) {
  const notRead = {};
  const extra = {};
  for (const type of new Set([...Object.keys(raw), ...Object.keys(parsed)])) {
    const r = raw[type] ?? 0;
    const p = parsed[type] ?? 0;
    if (r > p) notRead[type] = r - p;
    else if (p > r) extra[type] = p - r;
  }
  return { notRead, extra };
}

/**
 * @param {{
 *   label: string, fileName: string, bytes: number, sha256: string, text: string,
 *   parser: { name: string, version: string, parse(text: string): any },
 * }} input
 */
export function buildReport({ label, fileName, bytes, sha256, text, parser }) {
  const t0 = process.hrtime.bigint();
  const scan = rawScan(text);
  const t1 = process.hrtime.bigint();

  let raw = null;
  let parsed = null;
  const notRead = {};
  const notReadBySection = { entities: {}, blocks: {} };
  const extra = {};
  let parseMs = 0;
  // reportMs is the scan and the comparison, without the parse.
  let reportMs = ms(t0, t1);

  if (!scan.binary) {
    const dxf = parser.parse(text);
    const t2 = process.hrtime.bigint();
    parseMs = ms(t1, t2);
    if (dxf == null) throw new Error('parse_returned_null');

    raw = { ...scan.entities, blocks: scan.blocks };
    parsed = parsedCounts(dxf);
    const ent = compare(scan.entities.byType, parsed.byType);
    const blk = compare(scan.blocks.byType, parsed.blocks.byType);
    notReadBySection.entities = ent.notRead;
    notReadBySection.blocks = blk.notRead;
    for (const part of [ent.notRead, blk.notRead]) for (const [k, n] of Object.entries(part)) add(notRead, k, n);
    for (const part of [ent.extra, blk.extra]) for (const [k, n] of Object.entries(part)) add(extra, k, n);
    reportMs += ms(t2, process.hrtime.bigint());
  }

  return {
    schema: 1,
    ticket: 'EZD-029',
    label,
    file: { name: fileName, bytes, sha256 },
    runtime: {
      node: process.version,
      platform: process.platform,
      parser: { name: parser.name, version: parser.version },
      decoding: null,
      limits: null,
    },
    header: scan.binary ? null : scan.header,
    binary: scan.binary,
    raw,
    parsed,
    notRead,
    notReadBySection,
    extra,
    timing: { readMs: null, parseMs, reportMs, ms: null },
    memory: null,
    fitsOneSlice: null,
    pass: null,
  };
}
