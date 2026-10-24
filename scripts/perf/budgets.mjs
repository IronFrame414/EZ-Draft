// EZD-017 Step 1 (vault/plans/EZD-017.md section 3 table B): every performance budget, the only place budget
// numbers live, each with its source. Node built-ins only. `11` = vault/spec/sections/11-non-functional-requirements.md.
// Gate rows fail the check; trend rows are recorded and never fail (G1; 11 opening paragraph; R26 R10).
import zlib from 'node:zlib';
import { ENTRY_RULES } from '../../eslint-rules/boundaries.mjs';

/** 1 KB = 1,000 bytes (Q-0071 (a)). */
export const KB_BYTES = 1000;

/** Download size of a body: gzip at zlib level 6, in bytes (Q-0071 (a)). */
export function compressedSize(body) {
  return zlib.gzipSync(body, { level: 6 }).length;
}

const SIZE_SOURCE = '11 Budgets Download size; Q-0071 (a)';
const FRAME_SOURCE = '11 Budgets Pan row; Q-0061 (a)';

/** EZD-020 Step 6: a `contents.<entry>` gate row, value 0, rule = the entry's forbidden categories. */
function contents(entry, source) {
  return { id: `contents.${entry}`, kind: 'gate', unit: 'count', value: 0, rule: ENTRY_RULES[entry], source };
}

/**
 * Budget: { id; kind: 'gate' | 'trend'; unit: 'bytes' | 'count' | 'ms' | 'relative'; value: number | null;
 * rule?; statistic?: 'p95' | 'max'; toleranceMs?; source } (section 3).
 */
const ROWS = [
  { id: 'download.projects-settings', kind: 'gate', unit: 'bytes', value: 200 * KB_BYTES, source: SIZE_SOURCE },
  {
    id: 'download.editor',
    kind: 'gate',
    unit: 'bytes',
    value: 500 * KB_BYTES,
    source: `${SIZE_SOURCE}, "editor before its lazy parts"`,
  },
  { id: 'download.client-link', kind: 'gate', unit: 'bytes', value: 200 * KB_BYTES, source: SIZE_SOURCE },
  { id: 'download.field-pack', kind: 'gate', unit: 'bytes', value: 200 * KB_BYTES, source: SIZE_SOURCE },
  {
    id: 'download.sign-in',
    kind: 'gate',
    unit: 'bytes',
    value: 200 * KB_BYTES,
    source: 'Q-0072 (a) (per page); Q-0071 (a)',
  },
  { id: 'react-commits.pan', kind: 'gate', unit: 'count', value: 0, source: '11 rule 4; EZD-207 row' },
  { id: 'long-tasks.pan', kind: 'gate', unit: 'count', value: 0, source: 'Q-0073 (a); 11 opening paragraph' },
  { id: 'long-tasks.load', kind: 'trend', unit: 'count', value: null, source: 'Q-0073 (a)' },
  {
    id: 'frame.desktop',
    kind: 'trend',
    unit: 'ms',
    value: 1000 / 60,
    statistic: 'p95',
    toleranceMs: 1,
    source: FRAME_SOURCE,
  },
  {
    id: 'frame.ipad',
    kind: 'trend',
    unit: 'ms',
    value: 1000 / 30,
    statistic: 'p95',
    toleranceMs: 1,
    source: FRAME_SOURCE,
  },
  {
    id: 'frame.max',
    kind: 'trend',
    unit: 'ms',
    value: 100,
    statistic: 'max',
    toleranceMs: 0,
    source: '11 Budgets Pan row, "no frame over 100 ms"; Q-0061 (a)',
  },
  { id: 'tool-pick', kind: 'trend', unit: 'ms', value: 50, source: '11 Budgets Tool pick' },
  { id: 'tab-switch', kind: 'trend', unit: 'ms', value: 150, source: '11 Budgets Switch' },
  { id: 'tab-first-3d', kind: 'trend', unit: 'ms', value: 1000, source: '11 Budgets Switch, "first open of 3D"' },
  { id: 'open.cached', kind: 'trend', unit: 'ms', value: 1000, source: '11 Budgets Open a project' },
  { id: 'open.cold', kind: 'trend', unit: 'ms', value: 2500, source: '11 Budgets Open a project' },
  { id: 'projects.first-cards', kind: 'trend', unit: 'ms', value: 1000, source: '11 Budgets Projects page' },
  { id: 'autosave', kind: 'trend', unit: 'ms', value: 300, source: '11 Budgets Save' },
  {
    id: 'rows-per-save',
    kind: 'gate',
    unit: 'relative',
    value: null,
    rule: 'value <= changed',
    source: '03 Working copy and saves; P2; 12 Performance row',
  },
  {
    id: 'buffers-per-edit',
    kind: 'gate',
    unit: 'relative',
    value: null,
    rule: 'value <= changed',
    source: '11 rules 2, 4; EZD-1001a/c rows',
  },
  { id: 'draw-calls.frame', kind: 'gate', unit: 'count', value: null, source: '11 rule 4; EZD-901b row' },
  // EZD-020 Step 6: forbidden categories found in an entry's bundle (eslint-rules/boundaries.mjs ENTRY_RULES).
  contents('office', '11 rule 7; EZD-117a row ("loads no editor code")'),
  contents(
    'editor',
    '11 rule 7 (3D scene, path tracer, pdf.js, DXF, Detail editor, Sheets, catalog drawer are separate chunks); 11 Budgets "editor before its lazy parts"',
  ),
  contents('field-pack', '11 Budgets "with no editor or 3D code in them"; 11 rule 7; EZD-020 Done when'),
  contents(
    'client-link',
    '11 Budgets "with no editor or 3D code in them"; 11 rule 7; EZD-1202 row "no editor or 3D code on this page"',
  ),
  contents('sign-in', "11 rule 7; applied to the sign-in pages by EZD-020's plan; Q-0072 is about their size only"),
];

export const BUDGETS = Object.freeze(Object.fromEntries(ROWS.map((r) => [r.id, Object.freeze(r)])));
