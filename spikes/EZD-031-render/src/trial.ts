// EZD-031 Step 5: the trial loop. prepareTrial reads and checks everything and writes nothing; executeTrial runs the
// room x model pairs one at a time and rewrites the reports after every render.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImageEditProvider } from '../../../app/src/server/ai/types';
import { costFor, type CostReason, type ImageUsage } from './cost';
import { TrialError } from './errors';
import {
  DEFAULT_MODELS_PATH,
  DEFAULT_PRICES_PATH,
  loadModels,
  loadPrices,
  priceFor,
  validateRooms,
  type ModelEntry,
  type PriceEntry,
  type PriceTable,
  type Room,
} from './manifest';
import { imageInfo } from './image-info';
import { realSleep, renderOne, resolveAccess, type ProviderAccess, type Sleep } from './providers';
import { writeReports } from './report';

export type RunStatus = 'running' | 'complete' | 'complete_with_failures' | 'stopped_at_cap' | 'cancelled';

export type TrialOptions = {
  mode: 'stub' | 'live';
  rooms: string;
  models?: string;
  prices?: string;
  runDir?: string;
  resume?: string;
  providers?: ImageEditProvider[];
  capUsd?: number;
  env?: Record<string, string | undefined>;
  sleep?: Sleep;
};

export type CostRecord = {
  roomId: string;
  provider: ImageEditProvider;
  model: string;
  label: string;
  settings: Record<string, unknown> | null;
  status: 'ok' | 'failed';
  errorCode: string | null;
  output: string | null;
  mediaType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  usage: ImageUsage | null;
  rawUsage: unknown | null;
  price: { unit: string; rates: Record<string, number | null>; sourceUrl: string; retrieved: string } | null;
  costMicroUsd: number | null;
  costUsd: number | null;
  costReason: CostReason | null;
  requestId: string | null;
  ms: number;
  startedAt: string;
};

export type CostsFile = {
  runId: string;
  mode: 'stub' | 'live';
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  capUsd: number | null;
  totalMicroUsd: number;
  records: CostRecord[];
  summary: Record<
    string,
    { ok: number; failed: number; totalMicroUsd: number; meanMicroUsd: number | null; meanMs: number | null }
  >;
};
export type TrialSummary = CostsFile & { runDir: string };

export type PreparedTrial = {
  options: TrialOptions;
  runId: string;
  runDir: string;
  rooms: Room[];
  models: ModelEntry[];
  /** Every model of the file, in run order, so a resume keeps records of providers not selected now. */
  allModels: ModelEntry[];
  access: Record<ImageEditProvider, ProviderAccess>;
  renders: number;
  unpriced: ModelEntry[];
  previous: CostsFile | null;
};

const PROVIDER_ORDER: ImageEditProvider[] = ['gemini', 'openai', 'bfl'];
const SPIKE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_BY_MEDIA: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const recordKey = (roomId: string, provider: string, label: string) => `${roomId}|${provider}|${label}`;

function runOrder(models: ModelEntry[]): ModelEntry[] {
  return PROVIDER_ORDER.flatMap((p) => models.filter((m) => m.provider === p));
}

function hasNullRate(price: PriceEntry | null): boolean {
  if (!price) return true;
  return price.unit === 'per_token'
    ? price.inputPerMTok === null || price.outputPerMTok === null
    : price.perImage === null;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function readPrevious(resumeDir: string, mode: string): Promise<CostsFile> {
  let parsed: CostsFile;
  try {
    parsed = JSON.parse(await fs.readFile(path.join(resumeDir, 'costs.json'), 'utf8')) as CostsFile;
  } catch {
    throw new TrialError('resume_invalid', 'costs.json');
  }
  if (!parsed || parsed.mode !== mode || !Array.isArray(parsed.records) || typeof parsed.runId !== 'string') {
    throw new TrialError('resume_invalid', 'mode');
  }
  return parsed;
}

export async function prepareTrial(options: TrialOptions): Promise<PreparedTrial> {
  const env = options.env ?? process.env;
  if (options.resume !== undefined && options.runDir !== undefined) throw new TrialError('args_invalid', 'run-dir with resume');
  if (options.capUsd !== undefined && !(Number.isFinite(options.capUsd) && options.capUsd > 0)) {
    throw new TrialError('args_invalid', 'max-usd');
  }
  const providers = options.providers ?? PROVIDER_ORDER;
  if (providers.length === 0 || providers.some((p) => !PROVIDER_ORDER.includes(p))) {
    throw new TrialError('args_invalid', 'providers');
  }

  const rooms = await validateRooms(path.resolve(options.rooms));
  const allModels = runOrder(await loadModels(path.resolve(options.models ?? DEFAULT_MODELS_PATH)));
  const prices: PriceTable = await loadPrices(path.resolve(options.prices ?? DEFAULT_PRICES_PATH));

  let previous: CostsFile | null = null;
  let runId: string;
  let runDir: string;
  if (options.resume !== undefined) {
    runDir = path.resolve(options.resume);
    previous = await readPrevious(runDir, options.mode);
    runId = previous.runId;
  } else {
    runId = `${stamp(new Date())}-${options.mode}`;
    runDir = options.runDir !== undefined ? path.resolve(options.runDir) : path.join(SPIKE_DIR, 'runs', runId);
  }

  if (options.mode === 'live' && rooms.length !== 5) throw new TrialError('live_needs_5_rooms', String(rooms.length));
  const access = resolveAccess(options.mode, providers, env);

  const models = allModels.filter((m) => providers.includes(m.provider));
  const done = new Set(
    (previous?.records ?? []).filter((r) => r.status === 'ok').map((r) => recordKey(r.roomId, r.provider, r.label)),
  );
  let renders = 0;
  for (const room of rooms) for (const m of models) if (!done.has(recordKey(room.id, m.provider, m.label))) renders += 1;
  const unpriced = models.filter((m) => hasNullRate(priceFor(prices, m)));

  return { options, runId, runDir, rooms, models, allModels, access, renders, unpriced, previous };
}

async function emptyDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  for (const name of await fs.readdir(dir)) await fs.rm(path.join(dir, name), { recursive: true, force: true });
}

function summarize(records: CostRecord[]): CostsFile['summary'] {
  const out: CostsFile['summary'] = {};
  for (const r of records) {
    const key = `${r.provider}--${r.label}`;
    const s = (out[key] ??= { ok: 0, failed: 0, totalMicroUsd: 0, meanMicroUsd: null, meanMs: null });
    if (r.status === 'ok') s.ok += 1;
    else s.failed += 1;
    s.totalMicroUsd += r.costMicroUsd ?? 0;
  }
  for (const key of Object.keys(out)) {
    const ok = records.filter((r) => `${r.provider}--${r.label}` === key && r.status === 'ok');
    const priced = ok.filter((r) => r.costMicroUsd !== null);
    if (priced.length) out[key].meanMicroUsd = priced.reduce((a, r) => a + (r.costMicroUsd as number), 0) / priced.length;
    if (ok.length) out[key].meanMs = ok.reduce((a, r) => a + r.ms, 0) / ok.length;
  }
  return out;
}

export async function executeTrial(prepared: PreparedTrial): Promise<TrialSummary> {
  const { options, runId, runDir, rooms, allModels, access, previous } = prepared;
  const env = options.env ?? process.env;
  const sleep = options.sleep ?? realSleep;
  const prices = await loadPrices(path.resolve(options.prices ?? DEFAULT_PRICES_PATH));
  const active = new Set(prepared.models.map((m) => `${m.provider}|${m.label}`));
  const capMicro = options.capUsd !== undefined ? Math.round(options.capUsd * 1_000_000) : null;
  const startedAt = previous?.startedAt ?? new Date().toISOString();

  if (!previous) await emptyDir(runDir);
  else await fs.mkdir(runDir, { recursive: true });

  const inputs: Record<string, string> = {};
  for (const room of rooms) {
    const ext = EXT_BY_MEDIA[room.image.mediaType];
    inputs[room.id] = `${room.id}/input.${ext}`;
    await fs.mkdir(path.join(runDir, room.id), { recursive: true });
    await fs.writeFile(path.join(runDir, inputs[room.id]), room.image.data);
  }

  const existing = new Map((previous?.records ?? []).map((r) => [recordKey(r.roomId, r.provider, r.label), r]));
  const records: CostRecord[] = [];
  const total = () => records.reduce((a, r) => a + (r.costMicroUsd ?? 0), 0);
  let stopped = false;

  const snapshot = (status: RunStatus, finishedAt: string | null): CostsFile => ({
    runId,
    mode: options.mode,
    startedAt,
    finishedAt,
    status,
    capUsd: options.capUsd ?? null,
    totalMicroUsd: total(),
    records: records.slice(),
    summary: summarize(records),
  });
  const finalStatus = (): RunStatus => (records.some((r) => r.status === 'failed') ? 'complete_with_failures' : 'complete');

  for (const room of rooms) {
    for (const entry of allModels) {
      const prior = existing.get(recordKey(room.id, entry.provider, entry.label));
      if (prior && prior.status === 'ok') {
        records.push(prior);
        continue;
      }
      if (!active.has(`${entry.provider}|${entry.label}`) || stopped) {
        if (prior) records.push(prior);
        continue;
      }
      if (capMicro !== null && total() >= capMicro) {
        stopped = true;
        if (prior) records.push(prior);
        continue;
      }

      const startedIso = new Date().toISOString();
      const outcome = await renderOne({ mode: options.mode, room, entry, access: access[entry.provider], env, sleep });
      const price = priceFor(prices, entry);
      const base = `${room.id}/${entry.provider}--${entry.label}`;
      await fs.writeFile(path.join(runDir, `${base}.exchanges.json`), JSON.stringify(outcome.exchanges, null, 2));

      const priceRecord: CostRecord['price'] = price
        ? {
            unit: price.unit,
            rates:
              price.unit === 'per_token'
                ? { inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok }
                : { perImage: price.perImage },
            sourceUrl: price.sourceUrl,
            retrieved: price.retrieved,
          }
        : null;
      const common = {
        roomId: room.id,
        provider: entry.provider,
        model: entry.model,
        label: entry.label,
        settings: entry.settings,
        rawUsage: outcome.rawUsage,
        price: priceRecord,
        ms: outcome.ms,
        startedAt: startedIso,
      };

      if (outcome.ok) {
        const { image, usage, requestId } = outcome.result;
        const output = `${base}.${EXT_BY_MEDIA[image.mediaType]}`;
        await fs.writeFile(path.join(runDir, output), image.data);
        const info = imageInfo(image.data);
        const cost = costFor(usage, price);
        records.push({
          ...common,
          status: 'ok',
          errorCode: null,
          output,
          mediaType: image.mediaType,
          bytes: image.data.byteLength,
          width: info?.width ?? null,
          height: info?.height ?? null,
          usage,
          costMicroUsd: cost.costMicroUsd,
          costUsd: cost.costUsd,
          costReason: cost.reason,
          requestId,
        });
      } else {
        records.push({
          ...common,
          status: 'failed',
          errorCode: outcome.errorCode,
          output: null,
          mediaType: null,
          bytes: null,
          width: null,
          height: null,
          usage: null,
          costMicroUsd: null,
          costUsd: null,
          costReason: 'render_failed',
          requestId: null,
        });
      }
      await writeReports(runDir, snapshot('running', null), inputs);
    }
  }

  const status: RunStatus = stopped ? 'stopped_at_cap' : finalStatus();
  const costs = snapshot(status, new Date().toISOString());
  await writeReports(runDir, costs, inputs);
  return { ...costs, runDir };
}

export async function runTrial(options: TrialOptions): Promise<TrialSummary> {
  return executeTrial(await prepareTrial(options));
}
