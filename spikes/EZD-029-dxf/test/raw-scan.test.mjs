// EZD-029 T4 raw scanner (vault/plans/EZD-029.md Tests table; Approach Step 2: sub-records VERTEX,
// ATTRIB, SEQEND; group 67 paper space; BLOCK/ENDBLK; binary DXF = S11 States "Unreadable file";
// decoding AC1021 and later utf8, earlier latin1). T1's counts come from the EZD-016b expected JSON.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixtureDxf, runInLimits, withTmp, readResults } from './helpers/common.mjs';

const { rawScan } = await import('../src/raw-scan.mjs');

function dxf(...pairs) {
  return pairs.map(([code, value]) => `${code}\n${value}\n`).join('');
}

const ENTITIES_C = dxf(
  [0, 'SECTION'],
  [2, 'ENTITIES'],
  [0, 'INSERT'],
  [8, '0'],
  [0, 'ATTRIB'],
  [8, '0'],
  [0, 'ATTRIB'],
  [8, '0'],
  [0, 'SEQEND'],
  [8, '0'],
  [0, 'LINE'],
  [8, '0'],
  [67, 1],
  [0, 'ENDSEC'],
  [0, 'EOF'],
);

const BLOCKS_D = dxf(
  [0, 'SECTION'],
  [2, 'BLOCKS'],
  [0, 'BLOCK'],
  [8, '0'],
  [2, 'B'],
  [0, 'LINE'],
  [8, '0'],
  [0, 'LINE'],
  [8, '0'],
  [0, 'ENDBLK'],
  [8, '0'],
  [0, 'BLOCK'],
  [8, '0'],
  [2, 'C'],
  [0, 'POLYLINE'],
  [8, '0'],
  [0, 'VERTEX'],
  [8, '0'],
  [0, 'VERTEX'],
  [8, '0'],
  [0, 'VERTEX'],
  [8, '0'],
  [0, 'SEQEND'],
  [8, '0'],
  [0, 'ENDBLK'],
  [8, '0'],
  [0, 'ENDSEC'],
  [0, 'EOF'],
);

function headerE(acadVer) {
  return dxf(
    [0, 'SECTION'],
    [2, 'HEADER'],
    [9, '$ACADVER'],
    [1, acadVer],
    [9, '$DWGCODEPAGE'],
    [3, 'ANSI_1252'],
    [0, 'ENDSEC'],
  );
}

describe('EZD-029 raw scanner', () => {
  test('EZD-029 T4 (a) CRLF gives the same counts as T1', async () => {
    const lf = await readFile(fixtureDxf, 'utf8');
    const crlf = lf.replace(/\r?\n/g, '\r\n');
    assert.ok(crlf.includes('\r\n'));
    const r = rawScan(crlf);
    assert.equal(r.binary, false);
    assert.equal(r.header.acadVer, 'AC1009');
    assert.equal(r.header.insUnits, 1);
    assert.equal(r.entities.total, 22);
    assert.deepEqual(r.entities.byType, { LINE: 20, ARC: 1, POLYLINE: 1 });
    assert.deepEqual(r.entities.subRecords, { VERTEX: 4, SEQEND: 1 });
    assert.deepEqual(r.entities.byLayer, { WALLS: 16, DOORS: 2, WINDOWS: 3, ROOMS: 1 });
    assert.equal(r.entities.paperSpace, 0);
    assert.equal(r.blocks.count, 0);
    assert.deepEqual(rawScan(lf).entities, r.entities);
  });

  test('EZD-029 T4 (b) binary DXF: binary true and no other counts', () => {
    const buf = Buffer.concat([Buffer.from('AutoCAD Binary DXF\r\n', 'latin1'), Buffer.from([0x1a, 0x00])]);
    const r = rawScan(buf.toString('latin1'));
    assert.equal(r.binary, true);
    assert.equal(r.entities == null, true, 'no entity counts for a binary file');
    assert.equal(r.blocks == null, true, 'no block counts for a binary file');
  });

  test('EZD-029 T4 (c) ATTRIB and SEQEND are sub-records; group 67 = 1 is paper space', () => {
    const r = rawScan(ENTITIES_C);
    assert.equal(r.entities.total, 2);
    assert.deepEqual(r.entities.byType, { INSERT: 1, LINE: 1 });
    assert.deepEqual(r.entities.subRecords, { ATTRIB: 2, SEQEND: 1 });
    assert.equal(r.entities.paperSpace, 1);
  });

  test('EZD-029 T4 (d) BLOCK through ENDBLK is one definition, sub-record rule applies', () => {
    const r = rawScan(BLOCKS_D);
    assert.equal(r.blocks.count, 2);
    assert.equal(r.blocks.entities, 3);
    assert.deepEqual(r.blocks.byBlock, { B: 2, C: 1 });
  });

  test('EZD-029 T4 (e) header $ACADVER read; AC1027 decodes as utf8, AC1015 as latin1', async () => {
    assert.equal(rawScan(headerE('AC1027') + dxf([0, 'EOF'])).header.acadVer, 'AC1027');

    // The decoding is reported in the results JSON (Step 2 "The decoding used is reported";
    // Step 3 runtime.decoding), so it is read through the Step 4 CLI.
    await withTmp(async (tmp) => {
      const empty = dxf([0, 'SECTION'], [2, 'ENTITIES'], [0, 'ENDSEC'], [0, 'EOF']);
      for (const [ver, decoding] of [
        ['AC1027', 'utf8'],
        ['AC1015', 'latin1'],
      ]) {
        const file = path.join(tmp, `header-${ver}.dxf`);
        await writeFile(file, headerE(ver) + empty);
        const out = path.join(tmp, `out-${ver}`);
        const run = await runInLimits(['--file', file, '--label', ver, '--out', out]);
        assert.equal(run.code, 0, run.stderr);
        const r = (await readResults(out)).runs[ver];
        assert.equal(r.header.acadVer, ver);
        assert.equal(r.runtime.decoding, decoding, `${ver} decoding`);
      }
    });
  });
});
