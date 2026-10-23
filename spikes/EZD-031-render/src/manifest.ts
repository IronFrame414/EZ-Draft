// EZD-031 Step 2: rooms manifest, models list and price table, all checked before any request.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AiImage, ImageEditProvider } from '../../../app/src/server/ai/types';
import { imageInfo } from './image-info';
import { TrialError } from './errors';

/** The fixed opening sentence approved with Q-0083 (a). */
export const INSTRUCTION_OPENING =
  "Turn this 3D view into a photograph of the finished room. Keep the room's shape and every cabinet, fixture, door and window exactly where they are and at the same size.";

export type Room = {
  id: string;
  label: string | null;
  finishes: string;
  imagePath: string;
  image: AiImage;
  width: number;
  height: number;
};

export const instructionFor = (room: Room): string => INSTRUCTION_OPENING + ' ' + room.finishes;

const MAX_LONG_SIDE = 2048;
const ROOM_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{0,99}$/;
const LABEL = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PROVIDERS: readonly ImageEditProvider[] = ['gemini', 'openai', 'bfl'];
const EXTENSIONS: Record<string, { type: 'png' | 'jpeg' | 'webp'; mediaType: AiImage['mediaType'] }> = {
  '.png': { type: 'png', mediaType: 'image/png' },
  '.jpg': { type: 'jpeg', mediaType: 'image/jpeg' },
  '.jpeg': { type: 'jpeg', mediaType: 'image/jpeg' },
  '.webp': { type: 'webp', mediaType: 'image/webp' },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

async function readJsonFile(file: string, code: 'manifest_invalid' | 'models_invalid' | 'prices_invalid') {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  } catch {
    throw new TrialError(code, 'file');
  }
}

export async function validateRooms(manifestPath: string): Promise<Room[]> {
  const manifest = await readJsonFile(manifestPath, 'manifest_invalid');
  if (!isObject(manifest) || !Array.isArray(manifest.rooms) || manifest.rooms.length === 0) {
    throw new TrialError('manifest_invalid', 'rooms');
  }
  const baseDir = path.dirname(path.resolve(manifestPath));
  const seen = new Set<string>();
  const rooms: Room[] = [];
  for (const raw of manifest.rooms as unknown[]) {
    if (!isObject(raw)) throw new TrialError('manifest_invalid', 'room');
    const { id, label, image, finishes } = raw;
    if (typeof id !== 'string' || !ROOM_ID.test(id)) throw new TrialError('manifest_invalid', 'id');
    if (seen.has(id)) throw new TrialError('manifest_invalid', `${id}: duplicate id`);
    seen.add(id);
    if (typeof finishes !== 'string' || finishes.trim() === '') {
      throw new TrialError('manifest_invalid', `${id}: finishes`);
    }
    if (label !== undefined && typeof label !== 'string') {
      throw new TrialError('manifest_invalid', `${id}: label`);
    }
    if (typeof image !== 'string' || image === '') throw new TrialError('manifest_invalid', `${id}: image`);
    const known = EXTENSIONS[path.extname(image).toLowerCase()];
    if (!known) throw new TrialError('input_unsupported_type', id);
    const imagePath = path.resolve(baseDir, image);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await fs.readFile(imagePath));
    } catch {
      throw new TrialError('manifest_invalid', `${id}: image file`);
    }
    const info = imageInfo(bytes);
    if (!info || info.type !== known.type) throw new TrialError('input_unsupported_type', id);
    if (Math.max(info.width, info.height) > MAX_LONG_SIDE) throw new TrialError('input_too_large', id);
    rooms.push({
      id,
      label: label ?? null,
      finishes,
      imagePath,
      image: { mediaType: known.mediaType, data: bytes },
      width: info.width,
      height: info.height,
    });
  }
  return rooms;
}

export type ModelEntry = {
  provider: ImageEditProvider;
  model: string;
  label: string;
  settings: Record<string, unknown> | null;
};

/** Settings may add to what EZD-021 sends, never replace it (Step 2). */
function checkSettings(provider: ImageEditProvider, settings: Record<string, unknown>, where: string): void {
  const bad = (what: string) => new TrialError('models_invalid', `${where}: ${what}`);
  if (provider === 'gemini') {
    if ('contents' in settings) throw bad('contents');
    if ('generationConfig' in settings) {
      const config = settings.generationConfig;
      if (!isObject(config)) throw bad('generationConfig');
      if ('responseModalities' in config) throw bad('generationConfig.responseModalities');
    }
  } else if (provider === 'openai') {
    for (const key of ['model', 'prompt', 'image']) if (key in settings) throw bad(key);
    for (const [key, value] of Object.entries(settings)) if (typeof value !== 'string') throw bad(key);
  } else {
    for (const key of ['prompt', 'input_image']) if (key in settings) throw bad(key);
  }
}

export async function loadModels(file: string): Promise<ModelEntry[]> {
  const list = await readJsonFile(file, 'models_invalid');
  if (!Array.isArray(list) || list.length === 0) throw new TrialError('models_invalid', 'list');
  const labels = new Set<string>();
  return list.map((raw: unknown, index: number) => {
    const where = `entry ${index + 1}`;
    if (!isObject(raw)) throw new TrialError('models_invalid', where);
    const { provider, model, label, settings } = raw;
    if (!PROVIDERS.includes(provider as ImageEditProvider)) throw new TrialError('models_invalid', `${where}: provider`);
    if (typeof model !== 'string' || !MODEL_ID.test(model)) throw new TrialError('models_invalid', `${where}: model`);
    const finalLabel = label === undefined ? model : label;
    if (typeof finalLabel !== 'string' || !LABEL.test(finalLabel)) throw new TrialError('models_invalid', `${where}: label`);
    const key = `${provider}--${finalLabel}`;
    if (labels.has(key)) throw new TrialError('models_invalid', `${where}: duplicate label`);
    labels.add(key);
    if (settings !== undefined && !isObject(settings)) throw new TrialError('models_invalid', `${where}: settings`);
    if (settings) checkSettings(provider as ImageEditProvider, settings, where);
    return {
      provider: provider as ImageEditProvider,
      model,
      label: finalLabel,
      settings: settings ?? null,
    };
  });
}

export type PriceEntry =
  | {
      provider: ImageEditProvider;
      unit: 'per_token';
      inputPerMTok: number | null;
      outputPerMTok: number | null;
      sourceUrl: string;
      retrieved: string;
    }
  | {
      provider: ImageEditProvider;
      unit: 'per_image';
      perImage: number | null;
      sourceUrl: string;
      retrieved: string;
    };
export type PriceTable = { models: Record<string, PriceEntry> };

const rateOk = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

export async function loadPrices(file: string): Promise<PriceTable> {
  const table = await readJsonFile(file, 'prices_invalid');
  if (!isObject(table) || !isObject(table.models)) throw new TrialError('prices_invalid', 'models');
  for (const [name, entry] of Object.entries(table.models)) {
    const bad = (what: string) => new TrialError('prices_invalid', `${name}: ${what}`);
    if (!isObject(entry)) throw bad('entry');
    if (!PROVIDERS.includes(entry.provider as ImageEditProvider)) throw bad('provider');
    if (typeof entry.sourceUrl !== 'string' || typeof entry.retrieved !== 'string') throw bad('source');
    if (entry.unit === 'per_token') {
      if (!rateOk(entry.inputPerMTok) || !rateOk(entry.outputPerMTok)) throw bad('rate');
    } else if (entry.unit === 'per_image') {
      if (!rateOk(entry.perImage)) throw bad('rate');
    } else throw bad('unit');
  }
  return table as unknown as PriceTable;
}

export function priceFor(table: PriceTable, entry: ModelEntry): PriceEntry | null {
  return table.models[entry.label] ?? table.models[entry.model] ?? null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MODELS_PATH = path.resolve(here, '..', 'models.json');
export const DEFAULT_PRICES_PATH = path.resolve(here, '..', 'prices.json');
