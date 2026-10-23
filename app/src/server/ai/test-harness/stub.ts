// EZD-021 Step 3 (vault/plans/EZD-021.md): where a stub call finds its recording. Lookup order: (1) an in-process
// override from setStubRecording, (2) the file <AI_STUB_DIR>/<provider>/<purpose>.json (cross-process, for
// browser tests of later tickets), (3) the built-in recordings. None found throws AiError ai_stub_no_recording.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AiError } from '../errors';
import type { AiProvider } from '../types';
import {
  clearLastRecordedRequests,
  lastRecordedRequests,
  type RecordedRequest,
  type Recording,
} from './recorded-fetch';
import { BUILT_IN_RECORDINGS } from './recordings';

const OVERRIDES_KEY = '__ezdAiStubRecordings';

function overrides(): Record<string, Recording> {
  const g = globalThis as unknown as Record<string, Record<string, Recording> | undefined>;
  return (g[OVERRIDES_KEY] ??= {});
}

const keyOf = (provider: AiProvider, purpose: string) => `${provider}/${purpose}`;

export function setStubRecording(
  provider: AiProvider,
  purpose: string,
  recording: Recording,
): void {
  overrides()[keyOf(provider, purpose)] = recording;
}

/** Clears every override and the remembered requests of earlier stub calls. */
export function clearStubRecordings(): void {
  const map = overrides();
  for (const key of Object.keys(map)) delete map[key];
  clearLastRecordedRequests();
}

export function getStubRecording(
  provider: AiProvider,
  purpose: string,
  env: Record<string, string | undefined> = process.env,
): Recording {
  const key = keyOf(provider, purpose);
  const override = overrides()[key];
  if (override) return override;
  const dir = env.AI_STUB_DIR;
  if (dir) {
    const file = path.join(dir, provider, `${purpose}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Recording;
  }
  const builtIn = BUILT_IN_RECORDINGS[key];
  if (builtIn) return builtIn;
  throw new AiError('ai_stub_no_recording', { retry: false, provider });
}

/** The requests of the most recent stub call for `provider` (empty when there was none). */
export function lastStubRequests(provider: AiProvider): RecordedRequest[] {
  return lastRecordedRequests(provider);
}
