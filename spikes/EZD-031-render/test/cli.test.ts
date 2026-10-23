// EZD-031 tests T8 (CLI exit 2), T10, T12, T15 (CLI exit 2), T16 (vault/plans/EZD-031.md Tests; Interface contract src/cli.ts).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';
import { blockedAttempts } from '../../../app/test-harness/net-guard/net-guard.mjs';
import { clearStubRecordings, lastStubRequests } from '../../../app/src/server/ai/test-harness/stub';
import { main } from '../src/cli';
import { SPIKE_DIR, fixture, listFiles, makeIo, manifestWith, mkTmp, readJson } from './helpers';

beforeEach(() => clearStubRecordings());

const KEYS = { GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'k', BFL_API_KEY: 'k' };
const K_VALUE = /(?<![A-Za-z0-9])k(?![A-Za-z0-9])/;

function liveArgv(rooms: string, extra: string[] = ['--max-usd', '1']) {
  return [
    '--mode', 'live',
    '--rooms', rooms,
    '--models', fixture('models.stub.json'),
    '--prices', fixture('prices.test.json'),
    '--run-dir', path.join(mkTmp(), 'run'),
    ...extra,
  ];
}

describe('EZD-031 command line', () => {
  describe('T10 live-mode guards', () => {
    const cases: Array<{ name: string; env: Record<string, string | undefined>; isTTY?: boolean; rooms: string; extra?: string[]; error: string }> = [
      { name: '(a) CI set', env: { ...KEYS, CI: 'true' }, rooms: 'rooms.five.json', error: 'live_refused_ci' },
      { name: '(b) not a terminal', env: KEYS, isTTY: false, rooms: 'rooms.five.json', error: 'live_refused_no_tty' },
      { name: '(c) no cap', env: KEYS, rooms: 'rooms.five.json', extra: [], error: 'live_refused_no_cap' },
      { name: '(d) cap 0', env: KEYS, rooms: 'rooms.five.json', extra: ['--max-usd', '0'], error: 'live_refused_no_cap' },
      { name: '(e) one room', env: KEYS, rooms: 'rooms.stub.json', error: 'live_needs_5_rooms' },
    ];
    for (const c of cases) {
      it(`${c.name} is refused with ${c.error}, exit 2`, async () => {
        const before = blockedAttempts().length;
        const { io, out, err, prompts } = makeIo({ env: c.env, isTTY: c.isTTY, answer: 'yes' });
        const result = await main(liveArgv(fixture(c.rooms), c.extra), io);
        expect(result.exitCode).toBe(2);
        expect((result.error as any).code).toBe(c.error);
        expect(prompts).toHaveLength(0);
        expect(blockedAttempts().length).toBe(before);
        for (const line of [...out, ...err]) expect(line).not.toMatch(K_VALUE);
      });
    }

    it('(f) a missing GEMINI_API_KEY is AiError ai_key_not_set, exit 2', async () => {
      const before = blockedAttempts().length;
      const { io, out, err } = makeIo({ env: { OPENAI_API_KEY: 'k', BFL_API_KEY: 'k' }, answer: 'yes' });
      const result = await main(liveArgv(fixture('rooms.five.json')), io);
      expect(result.exitCode).toBe(2);
      expect((result.error as any).code).toBe('ai_key_not_set');
      expect(result.error!.message).toBe('AI key not set');
      expect(blockedAttempts().length).toBe(before);
      for (const line of [...out, ...err]) expect(line).not.toMatch(K_VALUE);
    });

    it('(g) all keys set and the answer "no" is cancelled, exit 0, nothing written', async () => {
      const before = blockedAttempts().length;
      const argv = liveArgv(fixture('rooms.five.json'));
      const { io, out, err, prompts } = makeIo({ env: KEYS, answer: 'no' });
      const result = await main(argv, io);
      expect(result.exitCode).toBe(0);
      expect(result.status).toBe('cancelled');
      expect(prompts).toHaveLength(1);
      expect(out.slice(0, 6)).toEqual(['rooms: 5', 'room: room-1', 'room: room-2', 'room: room-3', 'room: room-4', 'room: room-5']);
      for (const p of ['gemini', 'openai', 'bfl']) expect(out).toContain(`${p}: key found`);
      expect(listFiles(path.dirname(argv[argv.indexOf('--run-dir') + 1]))).toEqual([]);
      expect(blockedAttempts().length).toBe(before);
      for (const line of [...out, ...err]) expect(line).not.toMatch(K_VALUE);
    });
  });

  it('T16 an insecure GEMINI_BASE_URL is ai_base_url_invalid before the confirmation, exit 2', async () => {
    const before = blockedAttempts().length;
    const { io, prompts } = makeIo({ env: { ...KEYS, GEMINI_BASE_URL: 'http://insecure.example.test' }, answer: 'no' });
    const result = await main(liveArgv(fixture('rooms.five.json')), io);
    expect(result.exitCode).toBe(2);
    expect((result.error as any).code).toBe('ai_base_url_invalid');
    expect(prompts).toHaveLength(0);
    expect(blockedAttempts().length).toBe(before);
  });

  describe('T8 refused input gives exit 2, refused: <code> and writes nothing', () => {
    const cases: Array<[string, string, Record<string, string>, string, string]> = [
      ['(a) 2049 px image', 'w.png', { 'w.png': 'wide-2049.png' }, 'ok', 'input_too_large'],
      ['(c) .heic', 'x.heic', { 'x.heic': 'stub-room.png' }, 'ok', 'input_unsupported_type'],
      ['(d) empty finishes', 'x.png', { 'x.png': 'stub-room.png' }, '', 'manifest_invalid'],
    ];
    const run = async (rooms: any[], copy: Record<string, string>, code: string) => {
      const m = manifestWith(rooms, copy);
      const runDir = path.join(mkTmp(), 'run');
      const { io, err } = makeIo({});
      const result = await main(
        ['--mode', 'stub', '--rooms', m, '--run-dir', runDir, '--models', fixture('models.stub.json'), '--prices', fixture('prices.test.json')],
        io,
      );
      expect(result.exitCode).toBe(2);
      expect((result.error as any).code).toBe(code);
      expect(err).toContain(`refused: ${code}`);
      expect(fs.existsSync(path.join(runDir, 'costs.json'))).toBe(false);
      for (const p of ['gemini', 'openai', 'bfl'] as const) expect(lastStubRequests(p)).toHaveLength(0);
    };
    for (const [name, image, copy, finishes, code] of cases)
      it(name, () => run([{ id: 'a', image, finishes }], copy, code));
    it('(e) duplicate id', () =>
      run([{ id: 'a', image: 'x.png', finishes: 'ok' }, { id: 'a', image: 'x.png', finishes: 'ok' }], { 'x.png': 'stub-room.png' }, 'manifest_invalid'));
    it('(f) id "Room 1"', () =>
      run([{ id: 'Room 1', image: 'x.png', finishes: 'ok' }], { 'x.png': 'stub-room.png' }, 'manifest_invalid'));
  });

  it('T17 through main: an interrupted stub run exits 1 with crashed: Error and leaves running', async () => {
    const runDir = path.join(mkTmp(), 'run');
    const { io, err } = makeIo({});
    io.sleep = async () => {
      throw new Error('interrupted');
    };
    const result = await main(
      ['--mode', 'stub', '--rooms', fixture('rooms.stub.json'), '--run-dir', runDir, '--models', fixture('models.stub.json'), '--prices', fixture('prices.test.json')],
      io,
    );
    expect(result.exitCode).toBe(1);
    expect(err).toContain('crashed: Error');
    expect(readJson(path.join(runDir, 'costs.json')).status).toBe('running');
  });

  describe('T15 bad models give exit 2', () => {
    const entries: Array<[string, unknown[]]> = [
      ['contents', [{ provider: 'gemini', model: 'gemini-test-model', settings: { contents: [] } }]],
      ['responseModalities', [{ provider: 'gemini', model: 'gemini-test-model', settings: { generationConfig: { responseModalities: ['TEXT'] } } }]],
      ['openai number', [{ provider: 'openai', model: 'gpt-image-test', settings: { quality: 2 } }]],
      ['same label', [{ provider: 'gemini', model: 'gemini-test-model', label: 'same' }, { provider: 'gemini', model: 'gemini-test-model', label: 'same' }]],
    ];
    for (const [name, list] of entries) {
      it(`${name}: models_invalid, exit 2, no request`, async () => {
        const models = path.join(mkTmp(), 'models.json');
        fs.writeFileSync(models, JSON.stringify(list));
        const { io } = makeIo({});
        const result = await main(
          ['--mode', 'stub', '--rooms', fixture('rooms.stub.json'), '--models', models, '--prices', fixture('prices.test.json'), '--run-dir', path.join(mkTmp(), 'run')],
          io,
        );
        expect(result.exitCode).toBe(2);
        expect((result.error as any).code).toBe('models_invalid');
        for (const p of ['gemini', 'openai', 'bfl'] as const) expect(lastStubRequests(p)).toHaveLength(0);
      });
    }
  });

  it('T12 the spike-stub command saves images, costs.json, costs.csv and index.html', () => {
    const dir = mkTmp();
    const run = spawnSync(
      process.execPath,
      [
        '--import', '../../app/test-harness/net-guard/preload.mjs',
        '--import', 'tsx',
        'src/cli.ts',
        '--mode', 'stub',
        '--rooms', 'test/fixtures/rooms.stub.json',
        '--run-dir', dir,
        '--prices', 'test/fixtures/prices.test.json',
        '--models', 'test/fixtures/models.stub.json',
      ],
      { cwd: SPIKE_DIR, encoding: 'utf8', timeout: 90_000 },
    );
    expect(run.stderr).not.toContain('Live network blocked in tests:');
    expect(run.status).toBe(0);
    const files = listFiles(dir);
    for (const f of ['costs.json', 'costs.csv', 'index.html', 'stub-room/gemini--gemini-test-model.png', 'stub-room/openai--gpt-image-test.png', 'stub-room/bfl--flux-kontext-pro.png'])
      expect(files).toContain(f);
    const costs = readJson(path.join(dir, 'costs.json'));
    expect(costs.records).toHaveLength(3);
    expect(costs.records.every((r: any) => r.status === 'ok')).toBe(true);
    expect(costs.totalMicroUsd).toBe(124240);
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    expect(html.match(/<img/g)).toHaveLength(4);
    for (const src of ['stub-room/input.png', 'stub-room/gemini--gemini-test-model.png', 'stub-room/openai--gpt-image-test.png', 'stub-room/bfl--flux-kontext-pro.png'])
      expect(html).toContain(src);
    for (const n of ['0.039', '0.04524', '0.04']) expect(html).toContain(n);
  });
});
