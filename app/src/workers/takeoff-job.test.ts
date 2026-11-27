// EZD-1611a (AC-EZD-1611a-1; S19 Decision 3; EZD-235b serveJobs): the takeoff job a worker runs returns the fixture
// kitchen and bath's expected lines, reads its settings from Defaults, and answers through serveJobs.
// EZD-1611b: the job now returns the whole takeoff, so the fixture's three New cabinet boxes follow each room's
// room-finish lines (worked by hand: B36 and SB36 in the kitchen run, V30 in the bath vanity run), and the settings
// gain the countertop waste and the wire slack (09i "Slack 15%").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serveJobs, type JobReply, type JobScope } from './serve-jobs';
import { TAKEOFF_JOB, runTakeoff, takeoffSettingsFrom } from './takeoff-job';
import { effectiveValue } from '../lib/defaults/values';

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/geometry/src/takeoff/fixtures',
);
const read = (f: string) => JSON.parse(readFileSync(path.join(fixtures, f), 'utf8'));
const model = read('kitchen-bath.model.json') as { objects: unknown[] };
const kb = read('kitchen-bath.expected.json') as {
  settings: Record<string, unknown>;
  lines: { roomId: string | null }[];
};
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const box = (room: number, roomName: string, key: string, id: number) => ({
  roomId: uid(room),
  roomName,
  trade: 'cabinets',
  item: 'cabinet',
  key,
  unit: 'EA',
  qty: 1,
  waste: null,
  total: 1,
  count: null,
  sourceIds: [uid(id)],
});
const of = (room: number) => kb.lines.filter((l) => l.roomId === uid(room));
const expected = {
  settings: { ...kb.settings, countertopWaste: null, wireSlack: 15 },
  lines: [
    ...of(0x31),
    box(0x31, 'Kitchen', 'B36', 0x41),
    box(0x31, 'Kitchen', 'SB36', 0x42),
    ...of(0x32),
    box(0x32, 'Bath', 'V30', 0x44),
    ...of(0x33),
  ],
};

describe('EZD-1611a takeoff job', () => {
  it('returns the expected-quantity JSON for the fixture kitchen and bath', () => {
    expect(runTakeoff({ objects: model.objects, settings: expected.settings })).toEqual(
      expected.lines,
    );
  });

  it('leaves out an object that does not parse and refuses input that is not a job', () => {
    const broken = [...model.objects, { id: 'x', type: 'wall', schema_version: 7, data: {} }];
    expect(runTakeoff({ objects: broken, settings: expected.settings })).toEqual(expected.lines);
    expect(() => runTakeoff(null)).toThrow('takeoff_input');
    expect(() => runTakeoff({ objects: model.objects })).toThrow('takeoff_input');
  });

  it('reads the formulas table numbers from Defaults, and an unset waste stays unset', () => {
    // A company that has entered only tile waste, the straight pattern and a 4 x 12 sheet.
    const stored = { waste_tile: 10, pattern_straight: 0, drywall_sheet: '4x12' };
    expect(takeoffSettingsFrom((k) => effectiveValue(k, stored))).toEqual({
      waste: { tile: 10, drywall: null, paint: null, trim: null },
      pattern: { straight: 0, diagonal: null, herringbone: null },
      tileBoxSqFt: 10,
      drywallSheetSqFt: 48,
      paintCoats: 2,
      paintSqFtPerGallon: 350,
      countertopWaste: null,
      wireSlack: 15,
    });
    // A countertop waste and a wire slack entered are read as typed; 0 slack stays 0.
    const more = { ...stored, waste_countertop: 10, wire_slack: 0 };
    expect(takeoffSettingsFrom((k) => effectiveValue(k, more))).toMatchObject({
      countertopWaste: 10,
      wireSlack: 0,
    });
  });

  it('answers the job through serveJobs as a worker would', async () => {
    const replies: JobReply[] = [];
    const scope: JobScope = { onmessage: null, postMessage: (m) => replies.push(m) };
    serveJobs(scope, { [TAKEOFF_JOB]: (input) => runTakeoff(input) });
    scope.onmessage!({
      data: {
        id: 1,
        kind: TAKEOFF_JOB,
        input: { objects: model.objects, settings: expected.settings },
      },
    });
    scope.onmessage!({ data: { id: 2, kind: TAKEOFF_JOB, input: {} } });
    await new Promise((r) => setTimeout(r, 0));
    expect([...replies].sort((a, b) => a.id - b.id)).toEqual([
      { id: 1, ok: true, output: expected.lines },
      { id: 2, ok: false, error: 'worker.job_failed' },
    ]);
  });
});
