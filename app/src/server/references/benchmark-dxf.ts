// EZD-901a (phase-09 EZD-901a "adds the 150,000-entity DXF to the benchmark project"; 11 Budgets "Measured on the
// benchmark project: a whole-home model of 3,000 objects, a 150,000-entity reference DXF"): the benchmark's reference
// drawing, EZD-029's stand-in (spikes/EZD-029-dxf/src/standin.mjs, Step 5) carried into the app. An ASCII DXF R2000
// (AC1015, LF) of 1,500 repetitions of one 100-entity unit: 98 model-space entities (53 LINE, 10 ARC, 5 CIRCLE,
// 10 LWPOLYLINE, 2 ELLIPSE, 2 SPLINE, 4 TEXT, 3 MTEXT, 5 INSERT, 2 HATCH, 2 DIMENSION) on layer EZD-L<u mod 10> and
// 2 paper-space entities (LINE, TEXT). Same bytes on every call (no randomness, clock or argument). Lengths are
// decimal inches.

export const BENCHMARK_DXF_UNITS = 1500;
export const BENCHMARK_DXF_ENTITIES = BENCHMARK_DXF_UNITS * 100;
export const BENCHMARK_DXF_NAME = 'benchmark-reference-150k.dxf';

const LAYERS = ['0', ...Array.from({ length: 10 }, (_, i) => `EZD-L${i}`)];
const EZD_BLOCKS = Array.from({ length: 10 }, (_, i) => `EZD_B${i}`);
const BLOCK_NAMES = ['*Model_Space', '*Paper_Space', ...EZD_BLOCKS, '*D1'];
const MODEL_COUNTS: Array<[string, number]> = [
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

export function generateBenchmarkDxf(units = BENCHMARK_DXF_UNITS): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };
  const pt = (code: number, x: number, y: number, z = 0) => {
    g(code, x);
    g(code + 10, y);
    g(code + 20, z);
  };
  // Tables, block records, BLOCK/ENDBLK and objects take handles from 1; entities from 0x100.
  let lowHandle = 1;
  const low = () => (lowHandle++).toString(16).toUpperCase();
  let entityHandle = 0x100;
  const next = () => (entityHandle++).toString(16).toUpperCase();
  const head = (type: string, layer: string, subclass: string, paper = false) => {
    g(0, type);
    g(5, next());
    g(100, 'AcDbEntity');
    if (paper) g(67, 1);
    g(8, layer);
    g(100, subclass);
  };
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number, paper = false) => {
    head('LINE', layer, 'AcDbLine', paper);
    pt(10, x1, y1);
    pt(11, x2, y2);
  };
  const text = (layer: string, x: number, y: number, h: number, value: string, paper = false) => {
    head('TEXT', layer, 'AcDbText', paper);
    pt(10, x, y);
    g(40, h);
    g(1, value);
    g(100, 'AcDbText');
  };
  const table = (name: string, count: number) => {
    g(0, 'TABLE');
    g(2, name);
    g(5, low());
    g(100, 'AcDbSymbolTable');
    g(70, count);
  };

  g(0, 'SECTION');
  g(2, 'TABLES');
  table('LTYPE', 1);
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
  table('LAYER', LAYERS.length);
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
  table('BLOCK_RECORD', BLOCK_NAMES.length);
  for (const name of BLOCK_NAMES) {
    g(0, 'BLOCK_RECORD');
    g(5, low());
    g(100, 'AcDbSymbolTableRecord');
    g(100, 'AcDbBlockTableRecord');
    g(2, name);
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  // BLOCKS: 13 definitions, 43 entities (10 squares of 4 lines, *D1's 3 lines).
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

  // ENTITIES: the k-th model-space entity of a type in unit u is the base entity moved by (1.5 k, 0.25 u).
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  for (let u = 0; u < units; u++) {
    const layer = `EZD-L${u % 10}`;
    const dy = 0.25 * u;
    for (const [type, count] of MODEL_COUNTS) {
      for (let k = 0; k < count; k++) {
        const dx = 1.5 * k;
        if (type === 'LINE') line(layer, dx, dy, 96 + dx, dy);
        else if (type === 'ARC') {
          head('ARC', layer, 'AcDbCircle');
          pt(10, 120 + dx, 120 + dy);
          g(40, 24);
          g(100, 'AcDbArc');
          g(50, 0);
          g(51, 90);
        } else if (type === 'CIRCLE') {
          head('CIRCLE', layer, 'AcDbCircle');
          pt(10, 200 + dx, 120 + dy);
          g(40, 12);
        } else if (type === 'LWPOLYLINE') {
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
        } else if (type === 'ELLIPSE') {
          head('ELLIPSE', layer, 'AcDbEllipse');
          pt(10, 400 + dx, 120 + dy);
          pt(11, 30, 0);
          pt(210, 0, 0, 1);
          g(40, 0.5);
          g(41, 0);
          g(42, TWO_PI);
        } else if (type === 'SPLINE') {
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
        } else if (type === 'TEXT') text(layer, 600 + dx, dy, 6, `EZD-029 T${u}-${k}`);
        else if (type === 'MTEXT') {
          head('MTEXT', layer, 'AcDbMText');
          pt(10, 600 + dx, 60 + dy);
          g(40, 6);
          g(71, 1);
          g(1, `EZD-029 M${u}-${k}`);
        } else if (type === 'INSERT') {
          head('INSERT', layer, 'AcDbBlockReference');
          g(2, `EZD_B${(u + k) % 10}`);
          pt(10, 700 + dx, dy);
          g(41, 1);
          g(42, 1);
          g(43, 1);
          g(50, 0);
        } else if (type === 'HATCH') {
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
        } else {
          head('DIMENSION', layer, 'AcDbDimension');
          g(2, '*D1');
          pt(10, 96 + dx, -24 + dy);
          pt(11, 48 + dx, -21 + dy);
          g(70, 0);
          g(42, 96);
          g(100, 'AcDbAlignedDimension');
          pt(13, dx, dy);
          pt(14, 96 + dx, dy);
          g(50, 0);
          g(100, 'AcDbRotatedDimension');
        }
      }
    }
    const py = 0.25 * (u % 96);
    line(layer, 0, py, 36, py, true);
    text(layer, 1, 1 + py, 0.125, `EZD-029 P${u}`, true);
  }
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'OBJECTS');
  g(0, 'DICTIONARY');
  g(5, low());
  g(100, 'AcDbDictionary');
  g(0, 'ENDSEC');
  g(0, 'EOF');

  const header = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '1',
    '9', '$DWGCODEPAGE', '3', 'ANSI_1252',
    '9', '$HANDSEED', '5', entityHandle.toString(16).toUpperCase(),
    '0', 'ENDSEC',
  ];
  return `${header.join('\n')}\n${out.join('\n')}\n`;
}
