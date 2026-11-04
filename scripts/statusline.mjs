#!/usr/bin/env node
// Status line for Claude Code (vault/PROCESS.md sections 11 and 14). Reads the session payload on stdin, prints one short
// line, and writes the usage windows to vault/cost/usage.json for the launcher. Never fails the session: exits 0 on every input.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function win(w) {
  if (!w || typeof w.used_percentage !== 'number' || w.resets_at === undefined || w.resets_at === null) return null;
  const ms = typeof w.resets_at === 'number' ? w.resets_at * 1000 : Date.parse(w.resets_at);
  if (Number.isNaN(ms)) return null;
  return { pct: w.used_percentage, resets_at: new Date(ms).toISOString() };
}

try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'vault/cost');
  const usageFile = path.join(dir, 'usage.json');
  const sampleFile = path.join(dir, 'usage-raw-sample.json');
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch {}
  mkdirSync(dir, { recursive: true });
  let line = 'usage: no data';
  try {
    const limits = JSON.parse(raw)?.rate_limits;
    const five = win(limits?.five_hour), week = win(limits?.seven_day);
    if (five && week) {
      // Raw sample (EZD-240): the first payload that yields both windows, never one sent before any model call.
      if (!existsSync(usageFile) && !existsSync(sampleFile)) writeFileSync(sampleFile, raw);
      const out = { five_hour: five, seven_day: week, fable_seven_day: null, read_at: new Date().toISOString(), source: 'statusline' };
      const tmp = `${usageFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
      renameSync(tmp, usageFile);
      line = `5h ${Math.round(five.pct)}% · week ${Math.round(week.pct)}%`;
    }
  } catch {}
  process.stdout.write(line + '\n');
} catch {
  process.stdout.write('usage: no data\n');
}
process.exit(0);
