// EZD-031 tests T1, T2, T4, T5, T6, T7, T8, T11, T15 (vault/plans/EZD-031.md Tests; Interface contract).
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStubRecordings, lastStubRequests, setStubRecording } from '../../../app/src/server/ai/test-harness/stub';
import { STUB_PNG_B64 } from '../../../app/src/server/ai/test-harness/recordings/image';
import { INSTRUCTION_OPENING, validateRooms } from '../src/manifest';
import { runTrial } from '../src/trial';
import { PNG_SIGNATURE, fixture, listFiles, manifestWith, mkTmp, readJson, sha256, stubOptions } from './helpers';

const FINISHES = 'EZD-031 stub finishes.';
const INSTRUCTION = INSTRUCTION_OPENING + ' ' + FINISHES;
const IMAGES = [
  'stub-room/gemini--gemini-test-model.png',
  'stub-room/openai--gpt-image-test.png',
  'stub-room/bfl--flux-kontext-pro.png',
];

beforeEach(() => clearStubRecordings());

describe('EZD-031 render trial', () => {
  it('EZD-031 done when: with the stub provider the script saves an image and a cost record', async () => {
    const dir = mkTmp();
    const summary = await runTrial(stubOptions(dir));
    expect(summary.status).toBe('complete');
    expect(summary.mode).toBe('stub');

    const files = listFiles(dir);
    const want = sha256(Buffer.from(STUB_PNG_B64, 'base64'));
    for (const img of IMAGES) {
      expect(files).toContain(img);
      const bytes = fs.readFileSync(path.join(dir, img));
      expect(sha256(bytes)).toBe(want);
      expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    }

    const costs = readJson(path.join(dir, 'costs.json'));
    expect(costs.records).toHaveLength(3);
    expect(costs.records.map((r: any) => r.output)).toEqual(IMAGES);
    for (const r of costs.records) {
      expect(r.status).toBe('ok');
      expect(r.errorCode).toBeNull();
      expect(r.width).toBe(2);
      expect(r.height).toBe(2);
      expect(r.mediaType).toBe('image/png');
    }
    expect(costs.records.map((r: any) => r.usage)).toEqual([
      { inputTokens: 300, outputTokens: 1290, images: 1 },
      { inputTokens: 300, outputTokens: 1056, images: 1 },
      { inputTokens: null, outputTokens: null, images: 1 },
    ]);
    expect(costs.records.map((r: any) => r.costMicroUsd)).toEqual([39000, 45240, 40000]);
    [0.039, 0.04524, 0.04].forEach((usd, i) => expect(Math.abs(costs.records[i].costUsd - usd)).toBeLessThan(1e-9));
    expect(costs.totalMicroUsd).toBe(124240);
    expect(costs.records.map((r: any) => r.requestId)).toEqual(['gem_stub_1', 'oai_stub_1', 'bfl_stub_1']);

    const csv = fs.readFileSync(path.join(dir, 'costs.csv'), 'utf8');
    const lines = csv.split('\n').filter((l) => l !== '');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('room,provider,model,status,error_code,cost_usd,ms,width,height,output');
  });

  it('T2 what reaches each provider', async () => {
    await runTrial(stubOptions(mkTmp()));
    const input = fs.readFileSync(fixture('stub-room.png'));
    const b64 = input.toString('base64');

    const gem = lastStubRequests('gemini');
    expect(gem).toHaveLength(1);
    expect(gem[0].url.endsWith('/models/gemini-test-model:generateContent')).toBe(true);
    expect(gem[0].headers['x-goog-api-key']).toBe('stub-key');
    const gbody = JSON.parse(gem[0].bodyText!);
    expect(gbody.contents[0].parts[0].text).toBe(INSTRUCTION);
    expect(gbody.contents[0].parts[1].inlineData.data).toBe(b64);

    const oai = lastStubRequests('openai');
    expect(oai).toHaveLength(1);
    expect(oai[0].headers.authorization).toBe('Bearer stub-key');
    expect(oai[0].formData!.get('model')).toBe('gpt-image-test');
    expect(oai[0].formData!.get('prompt')).toBe(INSTRUCTION);
    const file = oai[0].formData!.get('image') as Blob;
    expect(Buffer.from(await file.arrayBuffer()).equals(input)).toBe(true);

    const bfl = lastStubRequests('bfl');
    expect(bfl).toHaveLength(4);
    expect(bfl[0].method).toBe('POST');
    expect(bfl[0].url.endsWith('/v1/flux-kontext-pro')).toBe(true);
    const bbody = JSON.parse(bfl[0].bodyText!);
    expect(bbody.prompt).toBe(INSTRUCTION);
    expect(bbody.input_image).toBe(b64);
    for (const i of [0, 1, 2]) expect(bfl[i].headers['x-key']).toBe('stub-key');
    expect(bfl[3].headers['x-key']).toBeUndefined();
  });

  it('T4 spend cap stops before the third render', async () => {
    const dir = mkTmp();
    const summary = await runTrial({ ...stubOptions(dir), capUsd: 0.05 });
    expect(summary.status).toBe('stopped_at_cap');
    expect(summary.records.map((r) => r.provider)).toEqual(['gemini', 'openai']);
    expect(summary.totalMicroUsd).toBe(84240);
    expect(lastStubRequests('bfl')).toHaveLength(0);
    const images = listFiles(dir).filter((f) => f.endsWith('.png') && !f.endsWith('/input.png'));
    expect(images).toHaveLength(2);
  });

  it('T5 a failure is recorded and the run goes on', async () => {
    setStubRecording('openai', 'test.image_edit', {
      provider: 'openai',
      purpose: 'test.image_edit',
      source: 'synthetic',
      exchanges: [
        { match: { method: 'POST', url: 'https://api.openai.com/v1/images/edits' }, response: { status: 400, json: {} } },
      ],
    });
    const dir = mkTmp();
    const summary = await runTrial(stubOptions(dir));
    expect(summary.status).toBe('complete_with_failures');
    const [g, o, b] = summary.records;
    expect(o.status).toBe('failed');
    expect(o.errorCode).toBe('ai_provider_rejected');
    expect(o.output).toBeNull();
    expect(o.costMicroUsd).toBeNull();
    expect(o.costReason).toBe('render_failed');
    expect(listFiles(dir)).not.toContain('stub-room/openai--gpt-image-test.png');
    expect(g.status).toBe('ok');
    expect(b.status).toBe('ok');
    expect(summary.totalMicroUsd).toBe(79000);
    expect(lastStubRequests('openai')).toHaveLength(1);
  });

  it('T6 resume re-runs only the pair without an ok record', async () => {
    const dir = mkTmp();
    const first = await runTrial(stubOptions(dir));
    const costsPath = path.join(dir, 'costs.json');
    const costs = readJson(costsPath);
    costs.records[2].status = 'failed';
    costs.records[2].errorCode = 'ai_provider_unavailable';
    costs.records[2].output = null;
    fs.writeFileSync(costsPath, JSON.stringify(costs, null, 2));
    fs.rmSync(path.join(dir, IMAGES[2]));

    clearStubRecordings();
    const { runDir: _unused, ...rest } = stubOptions(dir);
    const resumed = await runTrial({ ...rest, resume: dir });
    expect(lastStubRequests('gemini')).toHaveLength(0);
    expect(lastStubRequests('openai')).toHaveLength(0);
    const bfl = lastStubRequests('bfl');
    expect(bfl).toHaveLength(4);
    const after = readJson(costsPath);
    expect(after.records.filter((r: any) => r.status === 'ok')).toHaveLength(3);
    expect(after.runId).toBe(first.runId);
    expect(resumed.runId).toBe(first.runId);
  });

  it('T7 saved exchanges hold no secrets or images', async () => {
    const dir = mkTmp();
    await runTrial(stubOptions(dir));
    const exchangeFiles = listFiles(dir).filter((f) => f.endsWith('.exchanges.json'));
    expect(exchangeFiles).toHaveLength(3);
    const longStrings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') {
        if (v.length > 256) longStrings.push(v);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (const f of exchangeFiles) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const bad of ['stub-key', 'x-goog-api-key', 'authorization', 'x-key', FINISHES, INSTRUCTION_OPENING, STUB_PNG_B64]) {
        expect(text.includes(bad), `${f} contains ${bad.slice(0, 20)}`).toBe(false);
      }
      walk(JSON.parse(text));
    }
    expect(longStrings).toEqual([]);
    const gemini = JSON.parse(fs.readFileSync(path.join(dir, 'stub-room/gemini--gemini-test-model.exchanges.json'), 'utf8'));
    expect(JSON.stringify(gemini)).toContain('"candidatesTokenCount":1290');
    const usageMetadata = gemini.find((e: any) => e.json && e.json.usageMetadata).json.usageMetadata;
    expect(usageMetadata.candidatesTokenCount).toBe(1290);
    expect(readJson(path.join(dir, 'costs.json')).records[0].rawUsage).toEqual(usageMetadata);
  });

  describe('T8 input checks', () => {
    const png = { 'x.png': 'stub-room.png' };
    it('(a) 2049 px long side is input_too_large', async () => {
      const m = manifestWith([{ id: 'a', image: 'w.png', finishes: 'ok' }], { 'w.png': 'wide-2049.png' });
      await expect(validateRooms(m)).rejects.toMatchObject({ code: 'input_too_large' });
    });
    it('(b) 2048 px long side is accepted', async () => {
      const m = manifestWith([{ id: 'a', image: 'e.png', finishes: 'ok' }], { 'e.png': 'edge-2048.png' });
      const rooms = await validateRooms(m);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].width).toBe(2048);
      expect(rooms[0].height).toBe(2048);
    });
    it('(c) .heic is input_unsupported_type', async () => {
      const m = manifestWith([{ id: 'a', image: 'x.heic', finishes: 'ok' }], { 'x.heic': 'stub-room.png' });
      await expect(validateRooms(m)).rejects.toMatchObject({ code: 'input_unsupported_type' });
    });
    it('(d) empty finishes is manifest_invalid', async () => {
      const m = manifestWith([{ id: 'a', image: 'x.png', finishes: '' }], png);
      await expect(validateRooms(m)).rejects.toMatchObject({ code: 'manifest_invalid' });
    });
    it('(e) duplicate id is manifest_invalid', async () => {
      const m = manifestWith(
        [{ id: 'a', image: 'x.png', finishes: 'ok' }, { id: 'a', image: 'x.png', finishes: 'ok' }],
        png,
      );
      await expect(validateRooms(m)).rejects.toMatchObject({ code: 'manifest_invalid' });
    });
    it('(f) id "Room 1" is manifest_invalid', async () => {
      const m = manifestWith([{ id: 'Room 1', image: 'x.png', finishes: 'ok' }], png);
      await expect(validateRooms(m)).rejects.toMatchObject({ code: 'manifest_invalid' });
    });
    it('a refused run makes no request and writes no costs.json', async () => {
      const m = manifestWith([{ id: 'a', image: 'w.png', finishes: 'ok' }], { 'w.png': 'wide-2049.png' });
      const dir = mkTmp();
      await expect(runTrial({ ...stubOptions(dir), rooms: m })).rejects.toMatchObject({ code: 'input_too_large' });
      for (const p of ['gemini', 'openai', 'bfl'] as const) expect(lastStubRequests(p)).toHaveLength(0);
      expect(listFiles(dir)).toEqual([]);
    });
  });

  it('T11 provider subset', async () => {
    const dir = mkTmp();
    const summary = await runTrial({ ...stubOptions(dir), providers: ['gemini', 'openai'] });
    expect(summary.records).toHaveLength(2);
    expect(listFiles(dir).filter((f) => f.endsWith('.png') && !f.endsWith('/input.png'))).toHaveLength(2);
    expect(lastStubRequests('bfl')).toHaveLength(0);
  });

  describe('T15 models and settings chosen at run time', () => {
    const modelsFile = (entries: unknown[]) => {
      const f = path.join(mkTmp(), 'models.json');
      fs.writeFileSync(f, JSON.stringify(entries));
      return f;
    };
    it('adds settings to the first POST and keeps label and settings in the record', async () => {
      const settings = { ezdTopSetting: 'x', generationConfig: { ezdNested: 'y' } };
      const models = modelsFile([
        { provider: 'gemini', model: 'gemini-test-model', label: 'gemini-a', settings },
        { provider: 'openai', model: 'gpt-image-test', settings: { quality: 'high' } },
        { provider: 'bfl', model: 'flux-kontext-pro', settings: { ezdBflSetting: 1 } },
      ]);
      const dir = mkTmp();
      const summary = await runTrial({ ...stubOptions(dir), models });
      expect(summary.status).toBe('complete');
      const files = listFiles(dir);
      for (const f of ['stub-room/gemini--gemini-a.png', 'stub-room/openai--gpt-image-test.png', 'stub-room/bfl--flux-kontext-pro.png'])
        expect(files).toContain(f);

      const gbody = JSON.parse(lastStubRequests('gemini')[0].bodyText!);
      expect(gbody.ezdTopSetting).toBe('x');
      expect(gbody.generationConfig.ezdNested).toBe('y');
      expect(gbody.generationConfig.responseModalities).toContain('IMAGE');

      const form = lastStubRequests('openai')[0].formData!;
      expect(form.get('quality')).toBe('high');
      expect(form.get('model')).toBe('gpt-image-test');
      expect(form.get('prompt')).toBe(INSTRUCTION);

      const bfl = lastStubRequests('bfl');
      expect(JSON.parse(bfl[0].bodyText!).ezdBflSetting).toBe(1);
      expect(bfl).toHaveLength(4);
      for (const r of bfl.slice(1)) {
        expect(r.method).toBe('GET');
        expect(r.bodyText).toBeUndefined();
      }

      expect(summary.records[0].label).toBe('gemini-a');
      expect(summary.records[0].settings).toEqual(settings);
      expect(summary.records[1].label).toBe('gpt-image-test');
      expect(summary.records[1].settings).toEqual({ quality: 'high' });
    });

    const bad: Array<[string, unknown[]]> = [
      ['gemini settings.contents', [{ provider: 'gemini', model: 'gemini-test-model', settings: { contents: [] } }]],
      [
        'gemini generationConfig.responseModalities',
        [{ provider: 'gemini', model: 'gemini-test-model', settings: { generationConfig: { responseModalities: ['TEXT'] } } }],
      ],
      ['openai non-string value', [{ provider: 'openai', model: 'gpt-image-test', settings: { quality: 2 } }]],
      [
        'duplicate label',
        [
          { provider: 'gemini', model: 'gemini-test-model', label: 'same' },
          { provider: 'gemini', model: 'gemini-test-model', label: 'same' },
        ],
      ],
    ];
    for (const [name, entries] of bad) {
      it(`refuses ${name} with models_invalid before any request`, async () => {
        const dir = mkTmp();
        await expect(runTrial({ ...stubOptions(dir), models: modelsFile(entries) })).rejects.toMatchObject({
          code: 'models_invalid',
        });
        for (const p of ['gemini', 'openai', 'bfl'] as const) expect(lastStubRequests(p)).toHaveLength(0);
      });
    }
  });

  it('T17 an interrupted run is left running, and resume finishes it', async () => {
    const dir = mkTmp();
    const interrupt = async () => {
      throw new Error('interrupted');
    };
    await expect(runTrial({ ...stubOptions(dir), sleep: interrupt })).rejects.toThrow('interrupted');
    const costsPath = path.join(dir, 'costs.json');
    const mid = readJson(costsPath);
    expect(mid.status).toBe('running');
    expect(mid.finishedAt).toBeNull();
    expect(mid.records.map((r: any) => [r.provider, r.status])).toEqual([
      ['gemini', 'ok'],
      ['openai', 'ok'],
    ]);
    expect(mid.totalMicroUsd).toBe(84240);
    expect(listFiles(dir)).not.toContain(IMAGES[2]);

    clearStubRecordings();
    const { runDir: _unused, ...rest } = stubOptions(dir);
    await runTrial({ ...rest, resume: dir });
    expect(lastStubRequests('gemini')).toHaveLength(0);
    expect(lastStubRequests('openai')).toHaveLength(0);
    expect(lastStubRequests('bfl')).toHaveLength(4);
    const done = readJson(costsPath);
    expect(done.status).toBe('complete');
    expect(typeof done.finishedAt).toBe('string');
    expect(done.records.filter((r: any) => r.status === 'ok')).toHaveLength(3);
    expect(done.runId).toBe(mid.runId);
    expect(done.totalMicroUsd).toBe(124240);
  });
});
