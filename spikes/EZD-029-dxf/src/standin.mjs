// EZD-029 stand-in generator (vault/plans/EZD-029.md Step 5): an ASCII DXF R2000 (AC1015, LF) built
// from the DXF Reference group codes, with Node built-ins only, never the writer under test. The file
// is `units` repetitions of one 100-entity unit; 1,500 units is the 150,000-entity reference DXF of
// 11 Budgets. Every value is a spike input, not a product value (KNOWN-LIMITS 5). Lengths are decimal
// inches (03 rule 5).

const LAYERS = ['0', ...Array.from({ length: 10 }, (_, i) => `EZD-L${i}`)];
const EZD_BLOCKS = Array.from({ length: 10 }, (_, i) => `EZD_B${i}`);
const BLOCK_NAMES = ['*Model_Space', '*Paper_Space', ...EZD_BLOCKS, '*D1'];

/** Model-space entities per unit, in write order (Step 5 "Per unit"). */
const MODEL_COUNTS = [
  ['LINE', 53],
  ['ARC', 10],
  ['CIRCLE', 5],
  ['LWPOLYLINE', 10],
  ['ELLIPSE', 2],
  ['SPLINE', 2],
  ['TEXT', 4],
  ['MTEXT', 3],
  ['INSERT', 5],
  ['HATCH', 2],
  ['DIMENSION', 2],
];

const TWO_PI = 6.283185307179586;

/**
 * @param {{ units: number }} options
 * @returns {string}
 */
export function generateStandIn({ units }) {
  /** @type {string[]} */
  const out = [];
  /** @param {number} code @param {string | number} value */
  const g = (code, value) => {
    out.push(String(code), String(value));
  };
  /** @param {number} code @param {number} x @param {number} y @param {number} [z] */
  const pt = (code, x, y, z = 0) => {
    g(code, x);
    g(code + 10, y);
    g(code + 20, z);
  };

  // Tables, block records, BLOCK/ENDBLK and objects take handles from 1; every entity and block
  // entity takes a handle in sequence from 100 (hex), so the two ranges never meet (Step 5).
  let lowHandle = 1;
  const low = () => (lowHandle++).toString(16).toUpperCase();
  let entityHandle = 0x100;
  const next = () => (entityHandle++).toString(16).toUpperCase();

  /** Common entity groups: type, handle, AcDbEntity, paper space, layer, subclass. */
  const head = (type, layer, subclass, paper = false) => {
    g(0, type);
    g(5, next());
    g(100, 'AcDbEntity');
    if (paper) g(67, 1);
    g(8, layer);
    g(100, subclass);
  };
  const line = (layer, x1, y1, x2, y2, paper = false) => {
    head('LINE', layer, 'AcDbLine', paper);
    pt(10, x1, y1);
    pt(11, x2, y2);
  };
  const text = (layer, x, y, height, value, paper = false) => {
    head('TEXT', layer, 'AcDbText', paper);
    pt(10, x, y);
    g(40, height);
    g(1, value);
    g(100, 'AcDbText');
  };

  // The body is written first so $HANDSEED can name the next free handle.
  /** @type {string[]} */
  const body = [];
  const flush = () => {
    if (out.length) body.push(out.join('\n'));
    out.length = 0;
  };

  // TABLES: LTYPE CONTINUOUS, 11 layers, STYLE Standard, a BLOCK_RECORD per block.
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(5, low());
  g(100, 'AcDbSymbolTable');
  g(70, 1);
  g(0, 'LTYPE');
  g(5, low());
  g(100, 'AcDbSymbolTableRecord');
  g(100, 'AcDbLinetypeTableRecord');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, 0);
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(5, low());
  g(100, 'AcDbSymbolTable');
  g(70, LAYERS.length);
  for (const name of LAYERS) {
    g(0, 'LAYER');
    g(5, low());
    g(100, 'AcDbSymbolTableRecord');
    g(100, 'AcDbLayerTableRecord');
    g(2, name);
    g(70, 0);
    g(62, 7);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'STYLE');
  g(5, low());
  g(100, 'AcDbSymbolTable');
  g(70, 1);
  g(0, 'STYLE');
  g(5, low());
  g(100, 'AcDbSymbolTableRecord');
  g(100, 'AcDbTextStyleTableRecord');
  g(2, 'Standard');
  g(70, 0);
  g(40, 0);
  g(41, 1);
  g(50, 0);
  g(71, 0);
  g(42, 2.5);
  g(3, 'txt');
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'BLOCK_RECORD');
  g(5, low());
  g(100, 'AcDbSymbolTable');
  g(70, BLOCK_NAMES.length);
  for (const name of BLOCK_NAMES) {
    g(0, 'BLOCK_RECORD');
    g(5, low());
    g(100, 'AcDbSymbolTableRecord');
    g(100, 'AcDbBlockTableRecord');
    g(2, name);
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  // BLOCKS: 13 definitions, 43 entities.
  g(0, 'SECTION');
  g(2, 'BLOCKS');
  for (const name of BLOCK_NAMES) {
    g(0, 'BLOCK');
    g(5, low());
    g(100, 'AcDbEntity');
    if (name === '*Paper_Space') g(67, 1);
    g(8, '0');
    g(100, 'AcDbBlockBegin');
    g(2, name);
    g(70, name === '*D1' ? 1 : 0);
    pt(10, 0, 0);
    g(3, name);
    if (name.startsWith('EZD_B')) {
      // A 12-inch square.
      line('0', 0, 0, 12, 0);
      line('0', 12, 0, 12, 12);
      line('0', 12, 12, 0, 12);
      line('0', 0, 12, 0, 0);
    } else if (name === '*D1') {
      line('0', 0, -24, 96, -24);
      line('0', 0, -2, 0, -26);
      line('0', 96, -2, 96, -26);
    }
    g(0, 'ENDBLK');
    g(5, low());
    g(100, 'AcDbEntity');
    if (name === '*Paper_Space') g(67, 1);
    g(8, '0');
    g(100, 'AcDbBlockEnd');
  }
  g(0, 'ENDSEC');

  // ENTITIES: the k-th model-space entity of a type in unit u is the base entity moved by
  // (1.5 k, 0.25 u); the 2 paper-space entities stay on a 36 x 24 sheet.
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (let u = 0; u < units; u++) {
    const layer = `EZD-L${u % 10}`;
    const dy = 0.25 * u;
    for (const [type, count] of MODEL_COUNTS) {
      for (let k = 0; k < count; k++) {
        const dx = 1.5 * k;
        switch (type) {
          case 'LINE':
            line(layer, 0 + dx, 0 + dy, 96 + dx, 0 + dy);
            break;
          case 'ARC':
            head('ARC', layer, 'AcDbCircle');
            pt(10, 120 + dx, 120 + dy);
            g(40, 24);
            g(100, 'AcDbArc');
            g(50, 0);
            g(51, 90);
            break;
          case 'CIRCLE':
            head('CIRCLE', layer, 'AcDbCircle');
            pt(10, 200 + dx, 120 + dy);
            g(40, 12);
            break;
          case 'LWPOLYLINE':
            head('LWPOLYLINE', layer, 'AcDbPolyline');
            g(90, 4);
            g(70, 1);
            for (const [x, y] of [
              [300, 0],
              [348, 0],
              [348, 36],
              [300, 36],
            ]) {
              g(10, x + dx);
              g(20, y + dy);
            }
            break;
          case 'ELLIPSE':
            head('ELLIPSE', layer, 'AcDbEllipse');
            pt(10, 400 + dx, 120 + dy);
            pt(11, 30, 0);
            pt(210, 0, 0, 1);
            g(40, 0.5);
            g(41, 0);
            g(42, TWO_PI);
            break;
          case 'SPLINE':
            head('SPLINE', layer, 'AcDbSpline');
            pt(210, 0, 0, 1);
            g(70, 8);
            g(71, 3);
            g(72, 8);
            g(73, 4);
            g(74, 0);
            for (const knot of [0, 0, 0, 0, 1, 1, 1, 1]) g(40, knot);
            for (const [x, y] of [
              [500, 0],
              [520, 40],
              [560, 40],
              [580, 0],
            ]) {
              pt(10, x + dx, y + dy);
            }
            break;
          case 'TEXT':
            text(layer, 600 + dx, 0 + dy, 6, `EZD-029 T${u}-${k}`);
            break;
          case 'MTEXT':
            head('MTEXT', layer, 'AcDbMText');
            pt(10, 600 + dx, 60 + dy);
            g(40, 6);
            g(71, 1);
            g(1, `EZD-029 M${u}-${k}`);
            break;
          case 'INSERT':
            head('INSERT', layer, 'AcDbBlockReference');
            g(2, `EZD_B${(u + k) % 10}`);
            pt(10, 700 + dx, 0 + dy);
            g(41, 1);
            g(42, 1);
            g(43, 1);
            g(50, 0);
            break;
          case 'HATCH':
            // Group order: Step 5 HATCH row (DXF Reference order).
            g(0, 'HATCH');
            g(5, next());
            g(100, 'AcDbEntity');
            g(8, layer);
            g(100, 'AcDbHatch');
            pt(10, 0, 0, 0);
            pt(210, 0, 0, 1);
            g(2, 'SOLID');
            g(70, 1);
            g(71, 0);
            g(91, 1);
            g(92, 3);
            g(72, 0);
            g(73, 1);
            g(93, 4);
            for (const [x, y] of [
              [800, 0],
              [848, 0],
              [848, 48],
              [800, 48],
            ]) {
              g(10, x + dx);
              g(20, y + dy);
            }
            g(97, 0);
            g(75, 0);
            g(76, 1);
            g(98, 0);
            break;
          case 'DIMENSION':
            // Linear (70 = 0, rotation 0), block *D1.
            head('DIMENSION', layer, 'AcDbDimension');
            g(2, '*D1');
            pt(10, 96 + dx, -24 + dy);
            pt(11, 48 + dx, -21 + dy);
            g(70, 0);
            g(42, 96);
            g(100, 'AcDbAlignedDimension');
            pt(13, 0 + dx, 0 + dy);
            pt(14, 96 + dx, 0 + dy);
            g(50, 0);
            g(100, 'AcDbRotatedDimension');
            break;
          default:
            throw new Error(`no stand-in writer for ${type}`);
        }
      }
    }
    const py = 0.25 * (u % 96);
    line(layer, 0, py, 36, py, true);
    text(layer, 1, 1 + py, 0.125, `EZD-029 P${u}`, true);
    if (out.length > 200_000) flush();
  }
  g(0, 'ENDSEC');

  // OBJECTS: a minimal root dictionary.
  g(0, 'SECTION');
  g(2, 'OBJECTS');
  g(0, 'DICTIONARY');
  g(5, low());
  g(100, 'AcDbDictionary');
  g(0, 'ENDSEC');
  g(0, 'EOF');
  flush();

  if (lowHandle > 0x100) throw new Error('stand-in table handles reached the entity range');

  const header = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    '1',
    '9',
    '$DWGCODEPAGE',
    '3',
    'ANSI_1252',
    '9',
    '$HANDSEED',
    '5',
    entityHandle.toString(16).toUpperCase(),
    '0',
    'ENDSEC',
  ];
  return `${header.join('\n')}\n${body.join('\n')}\n`;
}
