// EZD-028 T10 inside the function limits (vault/plans/EZD-028.md Tests table; Approach Step 5;
// Q-0027 (a): Vercel Pro defaults, 300 s and 2 GB = 2048 MB).
import { describe, test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const spikeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_SECONDS = 300;
const LIMIT_MEMORY_MB = 2048;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: spikeDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

describe('EZD-028 function limits', () => {
  test(
    'T10 run-in-limits exits 0 within 300 s and 2048 MB, child started with --max-old-space-size=2048',
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-028-'));
      const result = await run([path.join('src', 'run-in-limits.mjs'), '--out', dir]);
      expect(result.code, result.stderr).toBe(0);

      const results = JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8'));
      expect(results.limits).toEqual({ seconds: LIMIT_SECONDS, memoryMb: LIMIT_MEMORY_MB });
      expect(results.room.ms).toBeLessThan(LIMIT_SECONDS * 1000);
      expect(results.room.maxRssMb).toBeLessThan(LIMIT_MEMORY_MB);
      expect(results.room.execArgv).toContain(`--max-old-space-size=${LIMIT_MEMORY_MB}`);
      expect(results.room.pdf).toBe('EZD-028-room.pdf');

      const doc = await PDFDocument.load(readFileSync(path.join(dir, 'EZD-028-room.pdf')), {
        updateMetadata: false,
      });
      const mediaBox = doc
        .getPage(0)
        .node.MediaBox()
        .asArray()
        .map((n) => n.asNumber());
      expect(mediaBox).toEqual([0, 0, 2592, 1728]);
    },
    LIMIT_SECONDS * 1000 + 60_000,
  );
});
