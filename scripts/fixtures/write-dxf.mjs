// EZD-016b Step 4.1 (vault/plans/EZD-016b.md): ASCII DXF R12 writer, LF line endings, no BLOCKS
// section. HEADER $ACADVER AC1009 and $INSUNITS 1 (inches); LTYPE CONTINUOUS; one LAYER record per
// drawing layer (colour 7, CONTINUOUS); LINE, ARC and closed POLYLINE + VERTEX + SEQEND entities.
// All z values are 0. Numbers use JavaScript's shortest decimal form.

/** @param {number} n */
const num = (n) => String(Object.is(n, -0) ? 0 : n);

/**
 * @param {import('./plan-drawing.mjs').Drawing} drawing
 * @returns {string}
 */
export function writeDxf(drawing) {
  /** @type {(string | number)[]} */
  const g = [];
  /** @param {number} code @param {string | number} value */
  const put = (code, value) => g.push(code, typeof value === 'number' ? num(value) : value);

  put(0, 'SECTION');
  put(2, 'HEADER');
  put(9, '$ACADVER');
  put(1, 'AC1009');
  put(9, '$INSUNITS');
  put(70, 1);
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'TABLES');
  put(0, 'TABLE');
  put(2, 'LTYPE');
  put(70, 1);
  put(0, 'LTYPE');
  put(2, 'CONTINUOUS');
  put(70, 0);
  put(3, 'Solid line');
  put(72, 65);
  put(73, 0);
  put(40, 0);
  put(0, 'ENDTAB');
  put(0, 'TABLE');
  put(2, 'LAYER');
  put(70, drawing.layers.length);
  for (const name of drawing.layers) {
    put(0, 'LAYER');
    put(2, name);
    put(70, 0);
    put(62, 7);
    put(6, 'CONTINUOUS');
  }
  put(0, 'ENDTAB');
  put(0, 'ENDSEC');

  put(0, 'SECTION');
  put(2, 'ENTITIES');
  for (const p of drawing.primitives) {
    if (p.type === 'line') {
      put(0, 'LINE');
      put(8, p.layer);
      put(10, p.a[0]);
      put(20, p.a[1]);
      put(30, 0);
      put(11, p.b[0]);
      put(21, p.b[1]);
      put(31, 0);
    } else if (p.type === 'arc') {
      put(0, 'ARC');
      put(8, p.layer);
      put(10, p.center[0]);
      put(20, p.center[1]);
      put(30, 0);
      put(40, p.radius);
      put(50, p.startDeg);
      put(51, p.endDeg);
    } else {
      put(0, 'POLYLINE');
      put(8, p.layer);
      put(66, 1);
      put(10, 0);
      put(20, 0);
      put(30, 0);
      put(70, 1);
      for (const [x, y] of p.points) {
        put(0, 'VERTEX');
        put(8, p.layer);
        put(10, x);
        put(20, y);
        put(30, 0);
      }
      put(0, 'SEQEND');
      put(8, p.layer);
    }
  }
  put(0, 'ENDSEC');
  put(0, 'EOF');
  return g.join('\n') + '\n';
}
