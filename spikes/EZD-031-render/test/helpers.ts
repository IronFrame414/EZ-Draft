// EZD-031 test helpers (no vitest import). Paths are absolute from this file.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPIKE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(SPIKE_DIR, '..', '..');
export const FIX = path.join(SPIKE_DIR, 'test', 'fixtures');
export const fixture = (name: string) => path.join(FIX, name);

export const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ezd031-'));
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const readJson = <T = any>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

export const stubOptions = (runDir: string) => ({
  mode: 'stub' as const,
  rooms: fixture('rooms.stub.json'),
  models: fixture('models.stub.json'),
  prices: fixture('prices.test.json'),
  runDir,
  env: {} as Record<string, string | undefined>,
  sleep: async () => {},
});

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

/** CLI io double: records out/err lines, counts ask() calls. */
export function makeIo(opts: {
  env?: Record<string, string | undefined>;
  isTTY?: boolean;
  answer?: string;
}) {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  return {
    out,
    err,
    prompts,
    io: {
      env: opts.env ?? {},
      isTTY: opts.isTTY ?? true,
      ask: async (prompt: string) => {
        prompts.push(prompt);
        return opts.answer ?? 'no';
      },
      out: (line: string) => void out.push(line),
      err: (line: string) => void err.push(line),
      sleep: async () => {},
    },
  };
}

/** Writes a rooms manifest and copies fixture images under the given names into a temp folder. */
export function manifestWith(
  rooms: Array<{ id: string; image: string; finishes: string }>,
  copy: Record<string, string>,
) {
  const dir = mkTmp();
  for (const [name, from] of Object.entries(copy)) fs.copyFileSync(fixture(from), path.join(dir, name));
  const file = path.join(dir, 'rooms.json');
  fs.writeFileSync(file, JSON.stringify({ rooms }));
  return file;
}
