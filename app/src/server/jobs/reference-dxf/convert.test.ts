// AC-EZD-901a-1: "For the fixture DXF the entity count per layer in the buffers equals the parser's count, and an
// entity type the parser does not support appears in the not-read count." Three numbers are held against each
// other per layer: the count decoded from the buffer bytes, a fresh run of the app's one parser (createDxfParser)
// over the same file, and the generator's declared count (fixtures/synthetic/architect-plan.dxf.expected.json,
// counted from scripts/fixtures/generate-architect.mjs declarations, never from this code). The unsupported type
// is the fixture's LEADER (dxf-parser 1.1.2 has no LEADER handler; R26 R16).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convertReferenceDxf, ReferenceReadError } from './convert';
import { ATLAS_CHARS } from '../../../editor/plan/glyph-atlas';
import { decodeLayerBuffer, encodeLayerBuffer, LayerBufferError, REFERENCE_GLYPH_CHARS } from './format';
import { createDxfParser } from './parser';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FIXTURE = path.join(repo, 'fixtures/synthetic/architect-plan.dxf');
const bytes = readFileSync(FIXTURE);
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8')) as {
  spaces: Array<{ id: string; block: string }>;
  entitiesByLayer: Record<string, number>;
  entitiesByLayerAndSpace: Record<string, Record<string, number>>;
  notRead: Record<string, number>;
  notReadByLayer: Record<string, number>;
  layers: Array<{ name: string }>;
};

// A minimal AC1015 DXF with the given ENTITIES group lines (and $DWGCODEPAGE when given).
function dxf(entities: string[], codePage = ''): string {
  const header = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1'];
  if (codePage) header.push('9', '$DWGCODEPAGE', '3', codePage);
  header.push('0', 'ENDSEC');
  return [...header, '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
}
function line(layer: string, a: [number, number], b: [number, number], paper = false): string[] {
  return ['0', 'LINE', ...(paper ? ['67', '1'] : []), '8', layer, '10', `${a[0]}`, '20', `${a[1]}`, '30', '0',
    '11', `${b[0]}`, '21', `${b[1]}`, '31', '0'];
}
function text(layer: string, value: string): string[] {
  return ['0', 'TEXT', '8', layer, '10', '0', '20', '0', '30', '0', '40', '1', '1', value];
}

type Parsed = {
  entities: Array<{ type: string; layer?: string }>;
  blocks: Record<string, { entities?: Array<{ type: string; layer?: string }> }>;
};

// The parser's count per layer: top-level entities of model space and the active layout (ENTITIES) and of the
// other layouts (their *Paper_SpaceN blocks, named in the expected JSON).
function parserCountByLayer(): Record<string, number> {
  const parsed = createDxfParser().parseSync(bytes.toString('latin1')) as Parsed;
  const out: Record<string, number> = {};
  const add = (list: Array<{ layer?: string }> | undefined) => {
    for (const e of list ?? []) out[e.layer ?? '0'] = (out[e.layer ?? '0'] ?? 0) + 1;
  };
  add(parsed.entities);
  for (const s of expected.spaces.slice(2)) add(parsed.blocks[s.block]?.entities);
  return out;
}

async function decodedByLayer() {
  const { manifest, files } = await convertReferenceDxf(bytes);
  const counts: Record<string, number> = {};
  const bySpace: Record<string, Record<string, number>> = {};
  // Model-space buffer of each layer (the layout buffers are counted in bySpace).
  const decoded = new Map<string, ReturnType<typeof decodeLayerBuffer>>();
  for (const layer of manifest.layers) {
    if (layer.files.length === 0) continue;
    counts[layer.name] = 0;
    bySpace[layer.name] = Object.fromEntries(expected.spaces.map((s) => [s.id, 0]));
    for (const f of layer.files) {
      const buf = decodeLayerBuffer(files.get(f.file)!);
      if (f.space === 0) decoded.set(layer.name, buf);
      counts[layer.name] += buf.entities.length;
      for (const e of buf.entities) {
        expect(e.space).toBe(f.space);
        bySpace[layer.name][expected.spaces[e.space].id] += 1;
      }
    }
  }
  return { manifest, counts, bySpace, decoded };
}

describe('EZD-901a reference conversion', () => {
  it('AC-EZD-901a-1 entity count per layer in the buffers equals the parser count and the declared count', async () => {
    const { counts } = await decodedByLayer();
    const parser = parserCountByLayer();
    expect(counts).toEqual(expected.entitiesByLayer);
    expect(parser).toEqual(expected.entitiesByLayer);
    expect(counts).toEqual(parser);
  });

  it('AC-EZD-901a-1 the unsupported LEADER is in the not-read count and in no buffer', async () => {
    const { manifest, decoded } = await decodedByLayer();
    expect(expected.notRead).toEqual({ LEADER: 1 });
    expect(manifest.notRead).toEqual(expected.notRead);
    // A-ANNO-NOTE holds its TEXT only; the LEADER beside it is not drawn.
    expect(decoded.get('A-ANNO-NOTE')!.entities.map((e) => e.type)).toEqual(['TEXT']);
    expect(expected.notReadByLayer).toEqual({ 'A-ANNO-NOTE': 1 });
  });

  it('keeps each entity in its space: model, the active layout and the second layout', async () => {
    const { manifest, bySpace } = await decodedByLayer();
    expect(manifest.spaces.map((s) => s.block)).toEqual(expected.spaces.map((s) => s.block));
    expect(bySpace).toEqual(expected.entitiesByLayerAndSpace);
  });

  it('lists every layer of the file with its colour, and units in inches', async () => {
    const { manifest } = await decodedByLayer();
    expect(manifest.layers.map((l) => l.name)).toEqual(expected.layers.map((l) => l.name));
    // ACI 1 is red, 3 green, 5 blue (AutoCAD colour index).
    const color = (n: string) => manifest.layers.find((l) => l.name === n)!.color;
    expect(color('A-ANNO-DIMS')).toBe('#ff0000');
    expect(color('A-DOOR')).toBe('#00ff00');
    expect(color('A-GLAZ')).toBe('#0000ff');
    expect(manifest.layers.find((l) => l.name === '0')!.files).toEqual([]);
    expect(manifest.units).toEqual({ insUnits: 1, name: 'inches', inchesPerUnit: 1 });
    expect(manifest.font).toBe('dm-mono-400');
  });

  it('draws lines, hatch fills, pattern lines, text and blocks into the buffers', async () => {
    const { decoded, manifest } = await decodedByLayer();
    const at = (layer: string) => decoded.get(layer)!;
    // A LINE is one segment, as declared: (0,0)-(240,0) relative to model space's origin.
    const wall = at('A-WALL');
    const o = manifest.spaces[0].origin;
    const [x0, y0, x1, y1] = wall.segments.slice(0, 4);
    expect([x0 + o.x, y0 + o.y, x1 + o.x, y1 + o.y]).toEqual([0, 0, 240, 0]);
    expect(wall.entities[0]).toMatchObject({ type: 'LINE', segCount: 1 });
    // The closed partition rectangle: four segments.
    expect(wall.entities[8]).toMatchObject({ type: 'LWPOLYLINE', segCount: 4 });
    // Solid hatch: a rectangle is two triangles; the ANSI31 hatch is drawn as pattern lines.
    const patt = at('A-PATT').entities;
    expect(patt[0]).toMatchObject({ type: 'HATCH', triCount: 2, segCount: 0 });
    expect(patt[1].type).toBe('HATCH');
    expect(patt[1].segCount).toBeGreaterThan(0);
    // "BEDROOM 2": eight glyphs (the space is a pen move, not a glyph), in the fallback font.
    const text = at('A-ANNO-TEXT');
    expect(text.entities[0]).toMatchObject({ type: 'TEXT', glyphCount: 8 });
    expect(text.glyphs[4]).toBe('B'.codePointAt(0));
    // MTEXT "MASTER\PSUITE": two lines, eleven glyphs.
    expect(text.entities[2]).toMatchObject({ type: 'MTEXT', glyphCount: 11 });
    // The BED insert draws its block: a closed 4-segment outline and one line.
    const furn = at('A-FURN').entities;
    expect(furn[0]).toMatchObject({ type: 'INSERT', segCount: 5 });
    // A dimension draws its block: 3 lines, 2 arrowheads, the "20'-0"" text (6 glyphs).
    expect(at('A-ANNO-DIMS').entities[0]).toMatchObject({
      type: 'DIMENSION',
      segCount: 3,
      triCount: 2,
      glyphCount: 6,
    });
  });

  it('indexes snap points in a grid: the wall corner (240, 180) is found in its cell', async () => {
    const { decoded, manifest } = await decodedByLayer();
    const wall = decoded.get('A-WALL')!;
    const g = wall.snapGrid;
    const x = 240 - manifest.spaces[0].origin.x;
    const y = 180 - manifest.spaces[0].origin.y;
    const col = Math.min(g.cols - 1, Math.floor((x - g.originX) / g.cellSize));
    const row = Math.min(g.rows - 1, Math.floor((y - g.originY) / g.cellSize));
    const cell = row * g.cols + col;
    const found: Array<[number, number]> = [];
    for (let i = wall.snapCells[cell]; i < wall.snapCells[cell + 1]; i++) {
      found.push([wall.snapPoints[i * 2], wall.snapPoints[i * 2 + 1]]);
    }
    expect(found).toContainEqual([x, y]);
    expect(wall.snapCells[wall.snapCells.length - 1]).toBe(wall.snapPoints.length / 2);
  });

  it('the revised copies, with and without handles, convert to their own declared counts', async () => {
    for (const f of ['architect-plan-rev.dxf', 'architect-plan-rev-nohandles.dxf']) {
      const file = path.join(repo, 'fixtures/synthetic', f);
      const exp = JSON.parse(readFileSync(`${file}.expected.json`, 'utf8')) as typeof expected;
      const { manifest, files } = await convertReferenceDxf(readFileSync(file));
      const counts = Object.fromEntries(
        manifest.layers
          .filter((l) => l.files.length > 0)
          .map((l) => [
            l.name,
            l.files.reduce((n, f) => n + decodeLayerBuffer(files.get(f.file)!).entities.length, 0),
          ]),
      );
      expect(counts, f).toEqual(exp.entitiesByLayer);
      expect(manifest.notRead, f).toEqual(exp.notRead);
    }
  });

  it('keeps model space and a layout apart: own files, own origin, own snap points', async () => {
    // Layer N has a model LINE far from 0,0 (a site plan's coordinates) and a paper-space LINE on a sheet.
    const { manifest, files } = await convertReferenceDxf(
      Buffer.from(
        dxf([
          ...line('N', [500000, 400000], [500240, 400000]),
          ...line('N', [0, 0], [36, 0], true),
        ]),
        'latin1',
      ),
    );
    const layer = manifest.layers.find((l) => l.name === 'N')!;
    expect(layer.files.map((f) => [f.space, f.entities])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(manifest.spaces[0].origin).toEqual({ x: 500000, y: 400000 });
    expect(manifest.spaces[1].origin).toEqual({ x: 0, y: 0 });
    const model = decodeLayerBuffer(files.get(layer.files[0].file)!);
    const paper = decodeLayerBuffer(files.get(layer.files[1].file)!);
    // 240" long, measured from the model's own origin, so Float32 keeps it exact.
    expect(Array.from(model.segments)).toEqual([0, 0, 240, 0]);
    expect(Array.from(model.snapPoints)).toEqual([0, 0, 240, 0]);
    expect(Array.from(paper.snapPoints)).toEqual([0, 0, 36, 0]);
  });

  it('decodes %% codes and \\U+ escapes, and counts characters the atlas cannot draw', async () => {
    // "30%%d" is 30 and a degree sign: the atlas has no degree sign, so 1 missing glyph and "30" drawn.
    // "\\U+0041%%uB" is "AB" (the escape is A, the underline toggle is not drawn). %%065 is "A".
    const { manifest, files } = await convertReferenceDxf(
      Buffer.from(dxf([...text('T', '30%%d'), ...text('T', '\\U+0041%%uB'), ...text('T', '%%065')]), 'latin1'),
    );
    expect(manifest.missingGlyphs).toBe(1);
    const buf = decodeLayerBuffer(files.get(manifest.layers.find((l) => l.name === 'T')!.files[0].file)!);
    const codes = (i: number) => {
      const e = buf.entities[i];
      return Array.from({ length: e.glyphCount }, (_, k) =>
        String.fromCodePoint(buf.glyphs[(e.glyphStart + k) * 5 + 4]),
      ).join('');
    };
    expect([codes(0), codes(1), codes(2)]).toEqual(['30', 'AB', 'A']);
  });

  it('writes only characters the plan glyph atlas draws', () => {
    expect(REFERENCE_GLYPH_CHARS).toBe(ATLAS_CHARS);
  });

  it('reads a pre-2007 file in its code page: ANSI_1252 byte 0x96 is an en dash', async () => {
    // windows-1252 0x96 is U+2013 (latin1 would give the C1 control U+0096); ANSI_1251 0xC4 is U+0414.
    const body = (page: string, byte: number) =>
      Buffer.concat([
        Buffer.from(dxf(text('T', 'A_B'), page).replace('A_B', 'A\u0000B'), 'latin1'),
      ]).map((b, i, all) => (b === 0 && all[i - 1] === 0x41 ? byte : b));
    const { decodeDxfBytes } = await import('./decode');
    expect(decodeDxfBytes(body('ANSI_1252', 0x96))).toContain('A\u2013B');
    expect(decodeDxfBytes(body('ANSI_1251', 0xc4))).toContain('A\u0414B');
    // No code page: AutoCAD's default, windows-1252.
    expect(decodeDxfBytes(body('', 0x93))).toContain('A\u201cB');
  });

  it('refuses a binary DXF and text that is not a DXF with stable codes', async () => {
    const binary = Buffer.from('AutoCAD Binary DXF\r\n\u001a\u0000rest', 'latin1');
    await expect(convertReferenceDxf(binary)).rejects.toThrow(ReferenceReadError);
    await expect(convertReferenceDxf(binary)).rejects.toThrow('binary_dxf');
    await expect(convertReferenceDxf(Buffer.from('not a drawing'))).rejects.toThrow('unreadable_dxf');
  });

  it('a layer buffer decodes to what was encoded and refuses a damaged one', async () => {
    const buf = {
      entities: [
        { type: 'LINE' as const, space: 0, segStart: 0, segCount: 1, triStart: 0, triCount: 0, glyphStart: 0, glyphCount: 0 },
      ],
      segments: Float32Array.from([0, 0, 1, 1]),
      triangles: new Float32Array(0),
      glyphs: new Float32Array(0),
      snapGrid: { originX: 0, originY: 0, cellSize: 1, cols: 1, rows: 1 },
      snapCells: Uint32Array.from([0, 2]),
      snapPoints: Float32Array.from([0, 0, 1, 1]),
    };
    const bytesOut = encodeLayerBuffer(buf);
    expect(decodeLayerBuffer(bytesOut)).toEqual(buf);
    expect(() => decodeLayerBuffer(bytesOut.slice(0, bytesOut.length - 4))).toThrow(LayerBufferError);
    const bad = bytesOut.slice();
    bad[0] = 0;
    expect(() => decodeLayerBuffer(bad)).toThrow('bad_magic');
  });
});
