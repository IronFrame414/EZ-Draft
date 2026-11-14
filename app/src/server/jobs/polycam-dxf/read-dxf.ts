// EZD-302 (phase-03 "Uses the DXF parser chosen in EZD-029"; docs/architecture.md ### DXF (EZD-029)): reads a DXF
// into the plain lines, arcs and polylines the detector needs, in model inches (03 rule 5). Runs in background jobs
// only (architecture "Where parsing runs"). Decoding rule from EZD-029: the text is read as latin1 to find
// $ACADVER; AC1021 (R2007) and later are decoded as UTF-8. A binary DXF is refused (binary_dxf), as is text the
// parser cannot read (unreadable_dxf). Units come from $INSUNITS; a missing or unitless value is read as inches
// (vault/build/assumptions.md EZD-302).
import * as dxfParserModule from 'dxf-parser';

export type Pt = { x: number; y: number };
export type DxfLine = { layer: string; a: Pt; b: Pt };
export type DxfArc = {
  layer: string;
  center: Pt;
  radius: number;
  startDeg: number;
  endDeg: number;
};
export type DxfPolyline = { layer: string; points: Pt[]; closed: boolean };
export type DxfDrawing = {
  layers: string[];
  lines: DxfLine[];
  arcs: DxfArc[];
  polylines: DxfPolyline[];
  // Entity types the detector does not use, counted by type (R26 R16: never dropped silently).
  skipped: Record<string, number>;
};

export class DxfReadError extends Error {
  constructor(readonly code: 'binary_dxf' | 'unreadable_dxf') {
    super(code);
    this.name = 'DxfReadError';
  }
}

// $INSUNITS codes (AutoCAD DXF reference, HEADER $INSUNITS) to inches.
const INCHES_PER_UNIT: Record<number, number> = {
  0: 1,
  1: 1,
  2: 12,
  4: 1 / 25.4,
  5: 1 / 2.54,
  6: 1 / 0.0254,
};

type ParserCtor = new () => { parseSync(text: string): unknown };

// In Node ESM the class is the default import; the named export is undefined at run time (EZD-029).
function parserCtor(): ParserCtor {
  const mod = dxfParserModule as unknown as { default?: unknown; DxfParser?: unknown };
  const candidate =
    (mod.default as { default?: unknown } | undefined)?.default ?? mod.default ?? mod.DxfParser;
  return candidate as ParserCtor;
}

export function decodeDxf(bytes: Uint8Array): string {
  const latin = Buffer.from(bytes).toString('latin1');
  if (latin.startsWith('AutoCAD Binary DXF')) throw new DxfReadError('binary_dxf');
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d{4})/.exec(latin);
  if (ver && Number(ver[1]) >= 1021) return Buffer.from(bytes).toString('utf8');
  return latin;
}

type RawPoint = { x?: unknown; y?: unknown };
type RawEntity = {
  type?: unknown;
  layer?: unknown;
  vertices?: RawPoint[];
  center?: RawPoint;
  radius?: unknown;
  startAngle?: unknown;
  endAngle?: unknown;
  shape?: unknown;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function readDxf(bytes: Uint8Array): DxfDrawing {
  const text = decodeDxf(bytes);
  let parsed: { header?: Record<string, unknown>; entities?: RawEntity[]; tables?: unknown } | null;
  try {
    const Parser = parserCtor();
    parsed = new Parser().parseSync(text) as typeof parsed;
  } catch {
    throw new DxfReadError('unreadable_dxf');
  }
  if (!parsed || !Array.isArray(parsed.entities)) throw new DxfReadError('unreadable_dxf');

  const units = num(parsed.header?.['$INSUNITS']) ?? 0;
  const k = INCHES_PER_UNIT[units] ?? 1;
  const pt = (p: RawPoint | undefined): Pt | null => {
    const x = num(p?.x);
    const y = num(p?.y);
    return x === null || y === null ? null : { x: x * k, y: y * k };
  };

  const out: DxfDrawing = { layers: [], lines: [], arcs: [], polylines: [], skipped: {} };
  const layers = new Set<string>();
  const skip = (type: string) => {
    out.skipped[type] = (out.skipped[type] ?? 0) + 1;
  };
  for (const e of parsed.entities) {
    const type = typeof e.type === 'string' ? e.type : 'UNKNOWN';
    const layer = typeof e.layer === 'string' ? e.layer : '0';
    layers.add(layer);
    if (type === 'LINE') {
      const a = pt(e.vertices?.[0]);
      const b = pt(e.vertices?.[1]);
      if (a && b) out.lines.push({ layer, a, b });
      else skip(type);
    } else if (type === 'ARC') {
      const center = pt(e.center);
      const r = num(e.radius);
      const s = num(e.startAngle);
      const t = num(e.endAngle);
      if (center && r !== null && s !== null && t !== null) {
        out.arcs.push({
          layer,
          center,
          radius: r * k,
          startDeg: (s * 180) / Math.PI,
          endDeg: (t * 180) / Math.PI,
        });
      } else skip(type);
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const points = (e.vertices ?? []).map(pt).filter((p): p is Pt => p !== null);
      if (points.length >= 2) out.polylines.push({ layer, points, closed: e.shape === true });
      else skip(type);
    } else {
      skip(type);
    }
  }
  out.layers = [...layers].sort();
  return out;
}
