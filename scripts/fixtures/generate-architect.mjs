// EZD-901a (phase-09 EZD-901a "The ticket commits a generator for a fixture architect DXF (layers, blocks, hatches,
// text, dims, two paper-space layouts) and a revised copy (one wall moved, one entity added, one removed, one dim
// value changed) with expected-count JSON"; EZD-909a "once with handles kept and once with handles stripped"):
// writes fixtures/synthetic/architect-plan.dxf, architect-plan-rev.dxf and architect-plan-rev-nohandles.dxf with
// their .expected.json files. ASCII DXF R2000 (AC1015, LF) written from the DXF Reference group codes with Node
// built-ins only, never the app's parser or a writer under test. Lengths are decimal inches ($INSUNITS 1; 03 rule 5).
//
// Every expected value comes from the declarations below: each entity is declared once with its layer, type and
// space, so the per-layer counts are counted from the declarations, never from parsing the written file. One LEADER
// is written on purpose: dxf-parser 1.1.2 has no LEADER handler, so it is the "type the parser does not support"
// of AC-EZD-901a-1 (R26 R16).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARCHITECT_FILE = 'architect-plan.dxf';
export const ARCHITECT_REV_FILE = 'architect-plan-rev.dxf';
export const ARCHITECT_REV_NOHANDLES_FILE = 'architect-plan-rev-nohandles.dxf';

/** Layers with their AutoCAD colour index (ACI), in table order. */
export const LAYERS = [
  ['0', 7],
  ['A-WALL', 7],
  ['A-DOOR', 3],
  ['A-GLAZ', 5],
  ['A-FURN', 8],
  ['A-PATT', 9],
  ['A-ANNO-TEXT', 2],
  ['A-ANNO-DIMS', 1],
  ['A-ANNO-NOTE', 6],
  ['A-TTLB', 7],
];

/** The spaces: model space, the active layout (ENTITIES with group 67 = 1) and the second layout (its block). */
export const SPACES = [
  { id: 'model', kind: 'model', block: '*Model_Space', name: 'Model' },
  { id: 'layout1', kind: 'paper', block: '*Paper_Space', name: 'A1.0 Floor plan' },
  { id: 'layout2', kind: 'paper', block: '*Paper_Space0', name: 'A2.0 Notes' },
];

/** Entity types dxf-parser 1.1.2 has no handler for, among the ones written here. */
export const UNSUPPORTED = ['LEADER'];

const num = (n) => String(Object.is(n, -0) ? 0 : n);

/**
 * @typedef {{ id: string, type: string, layer: string, space?: string, data: Record<string, any> }} Ent
 */

/** Block definitions (base point 0,0; contents on layer 0). */
function blocks() {
  const dim = (x1, y1, x2, y2, along, value) => {
    // A linear dimension's look: two extension lines, the dimension line, two arrowheads and its text.
    const horizontal = y1 === y2;
    const ents = [];
    if (horizontal) {
      ents.push({ type: 'LINE', data: { a: [x1, y1 - 2], b: [x1, along - 2] } });
      ents.push({ type: 'LINE', data: { a: [x2, y2 - 2], b: [x2, along - 2] } });
      ents.push({ type: 'LINE', data: { a: [x1, along], b: [x2, along] } });
      ents.push({ type: 'SOLID', data: { pts: [[x1, along], [x1 + 3, along + 1], [x1 + 3, along - 1]] } });
      ents.push({ type: 'SOLID', data: { pts: [[x2, along], [x2 - 3, along + 1], [x2 - 3, along - 1]] } });
      ents.push({ type: 'MTEXT', data: { at: [(x1 + x2) / 2, along + 4], h: 4, text: value, attach: 8 } });
    } else {
      ents.push({ type: 'LINE', data: { a: [x1 - 2, y1], b: [along - 2, y1] } });
      ents.push({ type: 'LINE', data: { a: [x2 - 2, y2], b: [along - 2, y2] } });
      ents.push({ type: 'LINE', data: { a: [along, y1], b: [along, y2] } });
      ents.push({ type: 'SOLID', data: { pts: [[along, y1], [along + 1, y1 + 3], [along - 1, y1 + 3]] } });
      ents.push({ type: 'SOLID', data: { pts: [[along, y2], [along + 1, y2 - 3], [along - 1, y2 - 3]] } });
      ents.push({ type: 'MTEXT', data: { at: [along - 4, (y1 + y2) / 2], h: 4, text: value, attach: 8, rot: Math.PI / 2 } });
    }
    return ents;
  };
  return {
    BED: [
      { type: 'LWPOLYLINE', data: { pts: [[0, 0], [60, 0], [60, 80], [0, 80]], closed: true } },
      { type: 'LINE', data: { a: [0, 60], b: [60, 60] } },
    ],
    LAV: [
      { type: 'CIRCLE', data: { c: [0, 0], r: 8 } },
      { type: 'LWPOLYLINE', data: { pts: [[-10, -12], [10, -12], [10, 12], [-10, 12]], closed: true } },
    ],
    dim,
  };
}

/**
 * The drawing of one variant: 'plan' or 'rev' (EZD-909a's revised copy).
 * @param {'plan' | 'rev'} variant
 */
export function architectDrawing(variant) {
  const rev = variant === 'rev';
  const b = blocks();
  const dimH = rev ? "15'-6\"" : "15'-0\"";
  const blockDefs = {
    BED: b.BED,
    LAV: b.LAV,
    '*D1': b.dim(0, 0, 240, 0, -24, "20'-0\""),
    '*D2': b.dim(0, 0, 0, 180, -24, dimH),
  };
  const partitionX = rev ? 126 : 120;
  /** @type {Ent[]} */
  const all = [
    // A-WALL: exterior faces and the interior partition (the wall the revision moves 6" east).
    { id: '100', type: 'LINE', layer: 'A-WALL', data: { a: [0, 0], b: [240, 0] } },
    { id: '101', type: 'LINE', layer: 'A-WALL', data: { a: [240, 0], b: [240, 180] } },
    { id: '102', type: 'LINE', layer: 'A-WALL', data: { a: [240, 180], b: [0, 180] } },
    { id: '103', type: 'LINE', layer: 'A-WALL', data: { a: [0, 180], b: [0, 0] } },
    { id: '104', type: 'LINE', layer: 'A-WALL', data: { a: [6, 6], b: [234, 6] } },
    { id: '105', type: 'LINE', layer: 'A-WALL', data: { a: [234, 6], b: [234, 174] } },
    { id: '106', type: 'LINE', layer: 'A-WALL', data: { a: [234, 174], b: [6, 174] } },
    { id: '107', type: 'LINE', layer: 'A-WALL', data: { a: [6, 174], b: [6, 6] } },
    {
      id: '108',
      type: 'LWPOLYLINE',
      layer: 'A-WALL',
      data: {
        pts: [[partitionX, 6], [partitionX + 4, 6], [partitionX + 4, 100], [partitionX, 100]],
        closed: true,
      },
    },
    // A-DOOR: a 32" door leaf and its swing.
    { id: '109', type: 'LINE', layer: 'A-DOOR', data: { a: [124, 100], b: [124, 132] } },
    { id: '10A', type: 'ARC', layer: 'A-DOOR', data: { c: [124, 100], r: 32, s: 0, e: 90 } },
    // A-GLAZ: two windows.
    { id: '10B', type: 'LINE', layer: 'A-GLAZ', data: { a: [40, 3], b: [100, 3] } },
    { id: '10C', type: 'LINE', layer: 'A-GLAZ', data: { a: [140, 177], b: [200, 177] } },
    // A-FURN: a bed and a lavatory (blocks), a column, an oval table and a curved counter edge.
    { id: '10D', type: 'INSERT', layer: 'A-FURN', data: { name: 'BED', at: [150, 110], rot: 90 } },
    { id: '10E', type: 'INSERT', layer: 'A-FURN', data: { name: 'LAV', at: [30, 140], rot: 0 } },
    { id: '10F', type: 'CIRCLE', layer: 'A-FURN', data: { c: [200, 40], r: 6 } },
    { id: '110', type: 'ELLIPSE', layer: 'A-FURN', data: { c: [60, 60], major: [20, 0], ratio: 0.5 } },
    {
      id: '111',
      type: 'SPLINE',
      layer: 'A-FURN',
      data: { degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], ctrl: [[160, 20], [170, 40], [190, 10], [210, 30]] },
    },
    // A-PATT: a solid hatch (polyline loop) and an ANSI31 pattern hatch (edge loop) at 3" spacing.
    {
      id: '112',
      type: 'HATCH',
      layer: 'A-PATT',
      data: { solid: true, loop: [[6, 150], [40, 150], [40, 174], [6, 174]] },
    },
    {
      id: '113',
      type: 'HATCH',
      layer: 'A-PATT',
      data: { solid: false, loop: [[200, 6], [234, 6], [234, 40], [200, 40]], angle: 45, spacing: 3 },
    },
    // A-ANNO-TEXT: room names.
    { id: '114', type: 'TEXT', layer: 'A-ANNO-TEXT', data: { at: [150, 60], h: 6, text: 'BEDROOM 2' } },
    { id: '115', type: 'TEXT', layer: 'A-ANNO-TEXT', data: { at: [60, 150], h: 6, text: 'BATH', halign: 1 } },
    { id: '116', type: 'MTEXT', layer: 'A-ANNO-TEXT', data: { at: [20, 100], h: 4, text: 'MASTER\\PSUITE', attach: 1 } },
    // A-ANNO-DIMS: the overall width and depth (the revision changes the depth's value).
    {
      id: '117',
      type: 'DIMENSION',
      layer: 'A-ANNO-DIMS',
      data: { block: '*D1', p1: [0, 0], p2: [240, 0], at: [0, -24], mid: [120, -20], text: "20'-0\"", m: 240 },
    },
    {
      id: '118',
      type: 'DIMENSION',
      layer: 'A-ANNO-DIMS',
      data: { block: '*D2', p1: [0, 0], p2: [0, 180], at: [-24, 0], mid: [-28, 90], text: dimH, m: rev ? 186 : 180 },
    },
    // A-ANNO-NOTE: a note and its leader (LEADER: the type the parser does not support).
    { id: '119', type: 'TEXT', layer: 'A-ANNO-NOTE', data: { at: [70, 124], h: 4, text: 'SEE NOTE 3' } },
    { id: '11A', type: 'LEADER', layer: 'A-ANNO-NOTE', data: { pts: [[100, 100], [80, 120]] } },
    // Layout A1.0 (the active layout): sheet border and title block text, in paper inches.
    { id: '11B', type: 'LINE', layer: 'A-TTLB', space: 'layout1', data: { a: [0, 0], b: [36, 0] } },
    { id: '11C', type: 'LINE', layer: 'A-TTLB', space: 'layout1', data: { a: [36, 0], b: [36, 24] } },
    { id: '11D', type: 'LINE', layer: 'A-TTLB', space: 'layout1', data: { a: [36, 24], b: [0, 24] } },
    { id: '11E', type: 'LINE', layer: 'A-TTLB', space: 'layout1', data: { a: [0, 24], b: [0, 0] } },
    { id: '11F', type: 'TEXT', layer: 'A-TTLB', space: 'layout1', data: { at: [28, 2], h: 0.25, text: 'A1.0 FLOOR PLAN' } },
    { id: '120', type: 'TEXT', layer: 'A-TTLB', space: 'layout1', data: { at: [28, 1], h: 0.18, text: 'WORTH PROPERTIES' } },
    // Layout A2.0 (the second layout, block *Paper_Space0).
    { id: '121', type: 'LINE', layer: 'A-TTLB', space: 'layout2', data: { a: [0, 0], b: [36, 0] } },
    { id: '122', type: 'LINE', layer: 'A-TTLB', space: 'layout2', data: { a: [36, 0], b: [36, 24] } },
    { id: '123', type: 'LINE', layer: 'A-TTLB', space: 'layout2', data: { a: [36, 24], b: [0, 24] } },
    { id: '124', type: 'LINE', layer: 'A-TTLB', space: 'layout2', data: { a: [0, 24], b: [0, 0] } },
    { id: '125', type: 'TEXT', layer: 'A-TTLB', space: 'layout2', data: { at: [28, 2], h: 0.25, text: 'A2.0 NOTES' } },
  ];
  // The revision removes the lavatory and adds a third window.
  const entities = all.filter((e) => !(rev && e.id === '10E'));
  if (rev) {
    entities.push({ id: '200', type: 'LINE', layer: 'A-GLAZ', data: { a: [237, 40], b: [237, 100] } });
  }
  return { blocks: blockDefs, entities };
}

/** What the revision changed against the plan, by handle (EZD-909a's expected diff). */
export const REVISION_CHANGES = {
  added: [{ handle: '200', layer: 'A-GLAZ', type: 'LINE' }],
  removed: [{ handle: '10E', layer: 'A-FURN', type: 'INSERT' }],
  moved: [{ handle: '108', layer: 'A-WALL', type: 'LWPOLYLINE', byIn: [6, 0] }],
  changed: [{ handle: '118', layer: 'A-ANNO-DIMS', type: 'DIMENSION', from: "15'-0\"", to: "15'-6\"" }],
};

/**
 * @param {ReturnType<typeof architectDrawing>} drawing
 * @param {{ handles: boolean }} options
 * @returns {string}
 */
export function writeArchitectDxf(drawing, { handles }) {
  /** @type {string[]} */
  const g = [];
  const put = (code, value) => g.push(String(code), typeof value === 'number' ? num(value) : value);
  const pt = (code, [x, y]) => {
    put(code, x);
    put(code + 10, y);
    put(code + 20, 0);
  };
  // Table, block and block-entity handles count from 1 and stay below 0x100, so they never meet entity handles.
  let low = 1;
  const lowHandle = () => (low++).toString(16).toUpperCase();
  const head = (type, handle, layer, paper) => {
    put(0, type);
    if (handles) put(5, handle);
    put(100, 'AcDbEntity');
    if (paper) put(67, 1);
    put(8, layer);
  };

  /** @param {{ type: string, data: any }} e @param {string} handle @param {string} layer @param {boolean} paper */
  const entity = (e, handle, layer, paper) => {
    const d = e.data;
    switch (e.type) {
      case 'LINE':
        head('LINE', handle, layer, paper);
        put(100, 'AcDbLine');
        pt(10, d.a);
        pt(11, d.b);
        break;
      case 'ARC':
        head('ARC', handle, layer, paper);
        put(100, 'AcDbCircle');
        pt(10, d.c);
        put(40, d.r);
        put(100, 'AcDbArc');
        put(50, d.s);
        put(51, d.e);
        break;
      case 'CIRCLE':
        head('CIRCLE', handle, layer, paper);
        put(100, 'AcDbCircle');
        pt(10, d.c);
        put(40, d.r);
        break;
      case 'ELLIPSE':
        head('ELLIPSE', handle, layer, paper);
        put(100, 'AcDbEllipse');
        pt(10, d.c);
        pt(11, d.major);
        put(40, d.ratio);
        put(41, 0);
        put(42, 6.283185307179586);
        break;
      case 'LWPOLYLINE':
        head('LWPOLYLINE', handle, layer, paper);
        put(100, 'AcDbPolyline');
        put(90, d.pts.length);
        put(70, d.closed ? 1 : 0);
        for (const [x, y] of d.pts) {
          put(10, x);
          put(20, y);
        }
        break;
      case 'SPLINE':
        head('SPLINE', handle, layer, paper);
        put(100, 'AcDbSpline');
        put(70, 8);
        put(71, d.degree);
        put(72, d.knots.length);
        put(73, d.ctrl.length);
        put(74, 0);
        for (const k of d.knots) put(40, k);
        for (const p of d.ctrl) pt(10, p);
        break;
      case 'TEXT':
        head('TEXT', handle, layer, paper);
        put(100, 'AcDbText');
        pt(10, d.at);
        put(40, d.h);
        put(1, d.text);
        if (d.halign) {
          put(72, d.halign);
          pt(11, d.at);
        }
        put(100, 'AcDbText');
        break;
      case 'MTEXT':
        head('MTEXT', handle, layer, paper);
        put(100, 'AcDbMText');
        pt(10, d.at);
        put(40, d.h);
        put(71, d.attach);
        put(1, d.text);
        // Group 50 of MTEXT is in radians (DXF Reference MTEXT).
        if (d.rot) put(50, d.rot);
        break;
      case 'INSERT':
        head('INSERT', handle, layer, paper);
        put(100, 'AcDbBlockReference');
        put(2, d.name);
        pt(10, d.at);
        if (d.rot) put(50, d.rot);
        break;
      case 'SOLID':
        head('SOLID', handle, layer, paper);
        put(100, 'AcDbTrace');
        pt(10, d.pts[0]);
        pt(11, d.pts[1]);
        pt(12, d.pts[2]);
        pt(13, d.pts[2]);
        break;
      case 'HATCH': {
        head('HATCH', handle, layer, paper);
        put(100, 'AcDbHatch');
        pt(10, [0, 0]);
        put(210, 0);
        put(220, 0);
        put(230, 1);
        put(2, d.solid ? 'SOLID' : 'ANSI31');
        put(70, d.solid ? 1 : 0);
        put(71, 0);
        put(91, 1);
        if (d.solid) {
          // Polyline boundary loop (flags 2 polyline + 1 external).
          put(92, 3);
          put(72, 0);
          put(73, 1);
          put(93, d.loop.length);
          for (const [x, y] of d.loop) {
            put(10, x);
            put(20, y);
          }
        } else {
          // Edge boundary loop of line edges (flags 1 external).
          put(92, 1);
          put(93, d.loop.length);
          d.loop.forEach((p, i) => {
            const q = d.loop[(i + 1) % d.loop.length];
            put(72, 1);
            put(10, p[0]);
            put(20, p[1]);
            put(11, q[0]);
            put(21, q[1]);
          });
        }
        put(97, 0);
        put(75, 0);
        put(76, 1);
        if (!d.solid) {
          // One pattern line, stored with its angle and spacing applied (DXF Reference HATCH pattern data).
          const a = (d.angle * Math.PI) / 180;
          put(52, 0);
          put(41, 1);
          put(77, 0);
          put(78, 1);
          put(53, d.angle);
          put(43, 0);
          put(44, 0);
          put(45, Number((-Math.sin(a) * d.spacing).toFixed(10)));
          put(46, Number((Math.cos(a) * d.spacing).toFixed(10)));
          put(79, 0);
        }
        put(98, 0);
        break;
      }
      case 'DIMENSION':
        head('DIMENSION', handle, layer, paper);
        put(100, 'AcDbDimension');
        put(2, d.block);
        pt(10, d.at);
        pt(11, d.mid);
        put(70, 32);
        put(1, d.text);
        put(42, d.m);
        put(100, 'AcDbAlignedDimension');
        pt(13, d.p1);
        pt(14, d.p2);
        break;
      case 'LEADER':
        head('LEADER', handle, layer, paper);
        put(100, 'AcDbLeader');
        put(71, 1);
        put(76, d.pts.length);
        for (const p of d.pts) pt(10, p);
        break;
      default:
        throw new Error(`unknown type ${e.type}`);
    }
  };

  put(0, 'SECTION');
  put(2, 'HEADER');
  put(9, '$ACADVER');
  put(1, 'AC1015');
  put(9, '$INSUNITS');
  put(70, 1);
  // $HANDSEED is a handle too, so the no-handles copy leaves it out.
  if (handles) {
    put(9, '$HANDSEED');
    put(5, '300');
  }
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'TABLES');
  put(0, 'TABLE');
  put(2, 'LTYPE');
  if (handles) put(5, lowHandle());
  put(100, 'AcDbSymbolTable');
  put(70, 1);
  put(0, 'LTYPE');
  if (handles) put(5, lowHandle());
  put(100, 'AcDbSymbolTableRecord');
  put(100, 'AcDbLinetypeTableRecord');
  put(2, 'CONTINUOUS');
  put(70, 0);
  put(3, 'Solid line');
  put(72, 65);
  put(73, 0);
  put(40, 0);
  put(0, 'ENDTAB');
  put(0, 'TABLE');
  put(2, 'LAYER');
  if (handles) put(5, lowHandle());
  put(100, 'AcDbSymbolTable');
  put(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    put(0, 'LAYER');
    if (handles) put(5, lowHandle());
    put(100, 'AcDbSymbolTableRecord');
    put(100, 'AcDbLayerTableRecord');
    put(2, name);
    put(70, 0);
    put(62, color);
    put(6, 'CONTINUOUS');
  }
  put(0, 'ENDTAB');
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'BLOCKS');
  const block = (name, paper, contents) => {
    put(0, 'BLOCK');
    if (handles) put(5, lowHandle());
    put(100, 'AcDbEntity');
    if (paper) put(67, 1);
    put(8, '0');
    put(100, 'AcDbBlockBegin');
    put(2, name);
    put(70, name.startsWith('*D') ? 1 : 0);
    pt(10, [0, 0]);
    put(3, name);
    put(1, '');
    for (const c of contents) entity(c.entity ?? c, c.handle ?? lowHandle(), c.layer ?? '0', paper);
    put(0, 'ENDBLK');
    if (handles) put(5, lowHandle());
    put(100, 'AcDbEntity');
    if (paper) put(67, 1);
    put(8, '0');
    put(100, 'AcDbBlockEnd');
  };
  block('*Model_Space', false, []);
  block('*Paper_Space', true, []);
  block(
    '*Paper_Space0',
    true,
    drawing.entities
      .filter((e) => e.space === 'layout2')
      .map((e) => ({ entity: e, handle: e.id, layer: e.layer })),
  );
  for (const [name, contents] of Object.entries(drawing.blocks)) block(name, false, contents);
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'ENTITIES');
  for (const e of drawing.entities) {
    if (e.space === 'layout2') continue;
    entity(e, e.id, e.layer, e.space === 'layout1');
  }
  put(0, 'ENDSEC');
  put(0, 'EOF');
  return g.join('\n') + '\n';
}

/**
 * The expected counts of one variant, counted from the declarations.
 * @param {'plan' | 'rev'} variant
 * @param {{ handles: boolean, file: string }} options
 */
export function architectExpected(variant, { handles, file }) {
  const drawing = architectDrawing(variant);
  const entitiesByLayer = {};
  const notReadByLayer = {};
  const bySpace = {};
  const byType = {};
  for (const e of drawing.entities) {
    const space = e.space ?? 'model';
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    if (UNSUPPORTED.includes(e.type)) {
      notReadByLayer[e.layer] = (notReadByLayer[e.layer] ?? 0) + 1;
      continue;
    }
    entitiesByLayer[e.layer] = (entitiesByLayer[e.layer] ?? 0) + 1;
    bySpace[e.layer] ??= Object.fromEntries(SPACES.map((s) => [s.id, 0]));
    bySpace[e.layer][space] += 1;
  }
  const notRead = {};
  for (const e of drawing.entities) {
    if (UNSUPPORTED.includes(e.type)) notRead[e.type] = (notRead[e.type] ?? 0) + 1;
  }
  const layouts = SPACES.filter((s) => s.kind === 'paper').map((s) => ({
    block: s.block,
    name: s.name,
    entities: drawing.entities.filter((e) => (e.space ?? 'model') === s.id && !UNSUPPORTED.includes(e.type))
      .length,
  }));
  return {
    fixture: file,
    generatedBy: 'scripts/fixtures/generate-architect.mjs',
    sources: [
      'Ticket EZD-901a Scope: layers, blocks, hatches, text, dims, two paper-space layouts; a revised copy',
      'AC-EZD-901a-1: entity count per layer equals the parser count; an unsupported type is in the not-read count',
      'EZD-909a: the fixture pair, once with handles kept and once with handles stripped',
      'R26 R16; docs/architecture.md DXF (EZD-029) counting method',
    ],
    units: 'in',
    header: { $ACADVER: 'AC1015', $INSUNITS: 1 },
    handles,
    layers: LAYERS.map(([name, aci]) => ({ name, aci })),
    spaces: SPACES,
    layouts,
    blocks: Object.fromEntries(Object.entries(drawing.blocks).map(([n, c]) => [n, c.length])),
    entityCount: drawing.entities.length,
    entitiesByType: byType,
    // Entities each layer's buffer holds (top-level entities of model space and both layouts).
    entitiesByLayer,
    entitiesByLayerAndSpace: bySpace,
    // Entities the parser cannot read, by type and by layer (never in a buffer).
    notRead,
    notReadByLayer,
    ...(variant === 'rev'
      ? {
          revisionOf: ARCHITECT_FILE,
          changes: handles
            ? REVISION_CHANGES
            : {
                note: 'Handles stripped: the same changes, matched by layer, type and nearest geometry (EZD-909a)',
                ...REVISION_CHANGES,
              },
        }
      : {}),
  };
}

const here = path.dirname(fileURLToPath(import.meta.url));

export function writeArchitectFixtures(outDir = path.resolve(here, '..', '..', 'fixtures', 'synthetic')) {
  const files = [
    [ARCHITECT_FILE, 'plan', true],
    [ARCHITECT_REV_FILE, 'rev', true],
    [ARCHITECT_REV_NOHANDLES_FILE, 'rev', false],
  ];
  for (const [file, variant, handles] of files) {
    const out = path.join(outDir, file);
    writeFileSync(out, Buffer.from(writeArchitectDxf(architectDrawing(variant), { handles }), 'latin1'));
    writeFileSync(
      `${out}.expected.json`,
      JSON.stringify(architectExpected(variant, { handles, file }), null, 2) + '\n',
    );
    process.stdout.write(`${out}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeArchitectFixtures();
}
