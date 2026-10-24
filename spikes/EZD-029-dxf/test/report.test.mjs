// EZD-029 T1 (Done when, first half), T2, T3 (vault/plans/EZD-029.md Tests table; Approach Steps 3, 4).
// Expected values: fixtures/synthetic/room-12x10.dxf.expected.json and EZD-016b T2 (22 entities,
// AC1009, $INSUNITS 1, no BLOCKS section); Q-0027 (a) limits 300 s, 2048 MB; R26 R16.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  repoRoot,
  fixtureDxf,
  LIMIT_SECONDS,
  LIMIT_MEMORY_MB,
  runInLimits,
  withTmp,
  readResults,
  stdoutLines,
  insertBeforeEntitiesEndsec,
} from './helpers/common.mjs';

const SYNTHETIC_BY_TYPE = { LINE: 20, ARC: 1, POLYLINE: 1 };
const SYNTHETIC_BY_LAYER = { WALLS: 16, DOORS: 2, WINDOWS: 3, ROOMS: 1 };
const SYNTHETIC_SUB_RECORDS = { VERTEX: 4, SEQEND: 1 };

// Step 3 Results JSON groups (schema: 1).
const REPORT_KEYS = new Set([
  'schema',
  'ticket',
  'label',
  'file',
  'runtime',
  'header',
  'binary',
  'raw',
  'parsed',
  'notRead',
  'notReadBySection',
  'extra',
  'timing',
  'memory',
  'fitsOneSlice',
  'pass',
]);

/** The parser named in the docs/architecture.md Named tools DXF row ("`<parser>` to read"). */
async function namedToolsParser() {
  const md = await readFile(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');
  const row = md.split('\n').find((l) => l.startsWith('| DXF |'));
  assert.ok(row, 'Named tools DXF row');
  const m = /`([^`]+)` to read/.exec(row);
  assert.ok(m, 'Named tools DXF row names the parser as "`<parser>` to read"');
  return m[1];
}

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allStrings(v, out);
    }
  }
  return out;
}

describe('EZD-029 report', () => {
  test('EZD-029 done when: the script prints the report for the synthetic fixture', async () => {
    await withTmp(async (tmp) => {
      const run = await runInLimits(['--file', fixtureDxf, '--label', 'synthetic', '--out', tmp]);
      assert.equal(run.code, 0, run.stderr);
      const lines = stdoutLines(run.stdout);
      assert.ok(lines.includes('EZD-029 report: synthetic'), run.stdout);
      assert.ok(lines.includes('entities in file: 22; read: 22'), run.stdout);
      assert.ok(lines.some((l) => l.startsWith('time:')), run.stdout);

      const r = (await readResults(tmp)).runs.synthetic;
      assert.ok(r, 'runs.synthetic');

      const bytes = await readFile(fixtureDxf);
      assert.equal(r.file.name, 'room-12x10.dxf');
      assert.equal(r.file.bytes, bytes.length);
      assert.equal(r.file.sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(r.binary, false);
      assert.equal(r.header.acadVer, 'AC1009');
      assert.equal(r.header.insUnits, 1);

      assert.equal(r.raw.total, 22);
      assert.deepEqual(r.raw.byType, SYNTHETIC_BY_TYPE);
      assert.deepEqual(r.raw.subRecords, SYNTHETIC_SUB_RECORDS);
      assert.deepEqual(r.raw.byLayer, SYNTHETIC_BY_LAYER);
      assert.equal(r.raw.paperSpace, 0);
      assert.equal(r.raw.blocks.count, 0);

      assert.equal(r.parsed.total, 22);
      assert.deepEqual(r.parsed.byType, SYNTHETIC_BY_TYPE);
      assert.deepEqual(r.notRead, {});
      assert.deepEqual(r.extra, {});

      assert.equal(r.runtime.parser.name, await namedToolsParser());
      assert.deepEqual(r.runtime.limits, { seconds: LIMIT_SECONDS, memoryMb: LIMIT_MEMORY_MB });
      assert.ok(r.timing.ms < LIMIT_SECONDS * 1000, `timing.ms ${r.timing.ms}`);
      assert.ok(r.memory.maxRssMb < LIMIT_MEMORY_MB, `maxRssMb ${r.memory.maxRssMb}`);
      assert.equal(r.pass, true);
    });
  });

  test('EZD-029 T2 report fields are counts only: Step 3 keys, no text value of the file', async () => {
    await withTmp(async (tmp) => {
      const run = await runInLimits(['--file', fixtureDxf, '--label', 'synthetic', '--out', tmp]);
      assert.equal(run.code, 0, run.stderr);
      const r = (await readResults(tmp)).runs.synthetic;
      for (const key of Object.keys(r)) assert.ok(REPORT_KEYS.has(key), `unexpected top-level key ${key}`);

      // The synthetic file holds no text value, so a TEXT `EZD-029 SECRET` is inserted (plan T2).
      const secretFile = path.join(tmp, 'secret.dxf');
      const text = await readFile(fixtureDxf, 'utf8');
      await writeFile(secretFile, insertBeforeEntitiesEndsec(text, '0\nTEXT\n1\nEZD-029 SECRET\n'));
      const secretOut = path.join(tmp, 'secret-out');
      const run2 = await runInLimits(['--file', secretFile, '--label', 'secret', '--out', secretOut]);
      assert.equal(run2.code, 0, run2.stderr);
      const json = await readFile(path.join(secretOut, 'results.json'), 'utf8');
      const s = JSON.parse(json).runs.secret;
      assert.ok(s, 'runs.secret');
      for (const key of Object.keys(s)) assert.ok(REPORT_KEYS.has(key), `unexpected top-level key ${key}`);
      assert.equal(json.includes('EZD-029 SECRET'), false, 'text value appears in results.json');
      assert.equal(allStrings(s).includes('EZD-029 SECRET'), false);
      assert.equal(run2.stdout.includes('EZD-029 SECRET'), false, 'text value appears in stdout');
    });
  });

  test('EZD-029 T3 unknown entity types are counted and listed, not dropped', async () => {
    await withTmp(async (tmp) => {
      const file = path.join(tmp, 'unknown.dxf');
      const text = await readFile(fixtureDxf, 'utf8');
      const record = '0\nEZD_TEST_UNKNOWN\n8\nWALLS\n';
      await writeFile(file, insertBeforeEntitiesEndsec(text, record + record));
      const out = path.join(tmp, 'out');
      const run = await runInLimits(['--file', file, '--label', 'unknown', '--out', out]);
      assert.equal(run.code, 0, run.stderr);

      const r = (await readResults(out)).runs.unknown;
      assert.ok(r, 'runs.unknown');
      assert.equal(r.raw.byType.EZD_TEST_UNKNOWN, 2);
      assert.equal(r.raw.byLayer.WALLS, 18);
      assert.equal(r.parsed.total, 22);
      assert.deepEqual(r.notRead, { EZD_TEST_UNKNOWN: 2 });
      assert.deepEqual(r.notReadBySection.entities, { EZD_TEST_UNKNOWN: 2 });

      const lines = stdoutLines(run.stdout);
      assert.ok(lines.includes('2 entities of type EZD_TEST_UNKNOWN not read'), run.stdout);
      assert.ok(lines.includes('entities in file: 24; read: 22'), run.stdout);
    });
  });
});
