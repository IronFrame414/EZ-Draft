// EZD-020 Step 5 (vault/plans/EZD-020.md): attributes the bytes of a generated JavaScript file to its sources
// through its source map (Source Map v3, ECMA-426), and normalizes source names. Node built-ins only.
import { Buffer } from 'node:buffer';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_VALUE = new Map([...B64].map((c, i) => [c, i]));

/** Base64 VLQ: 5 bits per digit, bit 6 = continuation, low bit of the value = sign. */
export function decodeVlq(str) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of str) {
    const digit = B64_VALUE.get(ch);
    if (digit === undefined) throw new Error(`invalid VLQ character ${ch}`);
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    const negative = value % 2 === 1;
    const n = Math.floor(value / 2);
    out.push(negative ? -n : n);
    value = 0;
    shift = 0;
  }
  return out;
}

/**
 * Adds the segments of one regular map to `lines` (generated line -> [{ col, source | null }]), shifted by
 * `offset` and cut off at `end` (the next section's offset, or null).
 */
function addSegments(lines, map, offset, end) {
  const root = map.sourceRoot ?? '';
  const sources = (map.sources ?? []).map((s) => (s === null ? null : root + s));
  let sourceIndex = 0;
  let line = offset.line;
  const groups = (map.mappings ?? '').split(';');
  const push = (l, seg) => {
    if (!lines.has(l)) lines.set(l, []);
    lines.get(l).push(seg);
  };
  // A section starts unmapped until its first segment.
  push(offset.line, { col: offset.column, source: null });
  for (let g = 0; g < groups.length; g++, line++) {
    let col = 0;
    const base = g === 0 ? offset.column : 0;
    for (const raw of groups[g].split(',')) {
      if (raw === '') continue;
      const f = decodeVlq(raw);
      col += f[0];
      const genCol = base + col;
      let source = null;
      if (f.length >= 4) {
        sourceIndex += f[1];
        source = sources[sourceIndex] ?? null;
      }
      if (end && (line > end.line || (line === end.line && genCol >= end.column))) continue;
      push(line, { col: genCol, source });
    }
  }
}

/**
 * @returns {{ bytesBySource: Record<string, number>, unmapped: number, total: number }} UTF-8 bytes per source.
 * A source referenced by at least one segment is present, even with 0 bytes.
 */
export function attribute(generatedText, map) {
  const lines = new Map();
  if (Array.isArray(map.sections)) {
    map.sections.forEach((section, i) => {
      const next = map.sections[i + 1];
      addSegments(lines, section.map, section.offset, next ? next.offset : null);
    });
  } else {
    addSegments(lines, map, { line: 0, column: 0 }, null);
  }

  const bytesBySource = {};
  let unmapped = 0;
  let total = 0;
  const textLines = generatedText.split('\n');
  textLines.forEach((text, l) => {
    if (l < textLines.length - 1) {
      unmapped += 1;
      total += 1;
    }
    const segs = (lines.get(l) ?? []).slice().sort((a, b) => a.col - b.col);
    const bytesOf = (from, to) => Buffer.byteLength(text.slice(from, to), 'utf8');
    const first = segs.length > 0 ? Math.min(segs[0].col, text.length) : text.length;
    const lead = bytesOf(0, first);
    unmapped += lead;
    total += lead;
    segs.forEach((seg, i) => {
      const from = Math.min(seg.col, text.length);
      const to = i + 1 < segs.length ? Math.min(segs[i + 1].col, text.length) : text.length;
      const n = bytesOf(from, to);
      total += n;
      if (seg.source === null) unmapped += n;
      else bytesBySource[seg.source] = (bytesBySource[seg.source] ?? 0) + n;
    });
  });
  return { bytesBySource, unmapped, total };
}

const PREFIXES = ['webpack://_N_E/', 'webpack:///', 'turbopack:///[project]/', '[project]/'];
const NODE_MODULES = 'node_modules/';
const NEXT_COMPILED = 'next/dist/compiled/';

/** @returns {{ key: string, pkg?: string, subpath?: string }} */
export function normalizeSource(s) {
  const at = s.lastIndexOf(NODE_MODULES);
  if (at >= 0) {
    let rest = s.slice(at + NODE_MODULES.length);
    // Next.js ships its own copies of React DOM and others under next/dist/compiled/<name>/ (the pinned build's
    // source form, EZD-020 Risks): they count as that package.
    if (rest.startsWith(NEXT_COMPILED)) rest = rest.slice(NEXT_COMPILED.length);
    const parts = rest.split('/');
    const n = parts[0].startsWith('@') ? 2 : 1;
    const pkg = parts.slice(0, n).join('/');
    return { key: `pkg:${pkg}`, pkg, subpath: parts.slice(n).join('/') };
  }
  let p = s;
  const prefix = PREFIXES.find((x) => p.startsWith(x));
  if (prefix) p = p.slice(prefix.length);
  while (p.startsWith('./') || p.startsWith('../')) p = p.slice(p.indexOf('/') + 1);
  if (p.startsWith('app/src/')) return { key: `app:${p.slice('app/src/'.length)}` };
  if (p.startsWith('src/')) return { key: `app:${p.slice('src/'.length)}` };
  if (p.startsWith('packages/geometry/src/')) {
    return { key: `geometry:${p.slice('packages/geometry/src/'.length)}` };
  }
  return { key: `other:${p}` };
}

/** `pkg:` keys stay as they are; `app:` and `geometry:` keep at most two folder segments, no file name. */
export function groupKey(key) {
  for (const kind of ['app:', 'geometry:']) {
    if (key.startsWith(kind)) {
      const folders = key.slice(kind.length).split('/').slice(0, -1);
      return kind + folders.slice(0, 2).join('/');
    }
  }
  return key;
}
