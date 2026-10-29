#!/usr/bin/env node
// Adopts pending research reports: moves each to vault/research/R-NNN.md and appends one index line.
// Usage: node vault/tools/research.mjs adopt [--ticket <T>]   (vault/PROCESS.md section 13; PA3-MECHANISMS.md Item 6)
// With a ticket, only that ticket's pending reports are adopted; the others stay in pending/ (EZD-173 C11).
import { existsSync, realpathSync, readFileSync, readdirSync, renameSync, statSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED = ['title', 'scope', 'ticket'];

function parse(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines[0] !== '---') return { reason: 'no front matter' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { reason: 'no front matter' };
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (REQUIRED.includes(key)) fields[key] = line.slice(i + 1).trim().replace(/\|/g, '/');
  }
  for (const key of REQUIRED) if (!fields[key]) return { reason: `missing ${key}` };
  return { fields };
}

export function adopt(researchDir, date, { ticket: only } = {}) {
  const pending = join(researchDir, 'pending');
  const result = { ids: [], skipped: [], moved: [] };
  if (!existsSync(pending)) return result;
  const candidates = readdirSync(pending)
    .filter((f) => f.endsWith('.md') && !f.startsWith('.') && statSync(join(pending, f)).isFile())
    .sort();
  if (candidates.length === 0) return result;
  const indexPath = join(researchDir, 'INDEX.md');
  if (!existsSync(indexPath)) throw new Error('vault/research/INDEX.md not found');
  const index = readFileSync(indexPath, 'utf8');
  let max = 0;
  for (const f of readdirSync(researchDir)) {
    const m = f.match(/^R-(\d+)\.md$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const line of index.split('\n')) {
    const m = line.match(/^R-(\d+) \|/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  const lines = [];
  for (const file of candidates) {
    const parsed = parse(readFileSync(join(pending, file), 'utf8'));
    if (parsed.reason) {
      result.skipped.push({ file, reason: parsed.reason });
      continue;
    }
    if (only && parsed.fields.ticket !== only) continue;
    const id = 'R-' + String(n).padStart(3, '0');
    renameSync(join(pending, file), join(researchDir, id + '.md'));
    const { title, scope, ticket } = parsed.fields;
    lines.push(`${id} | ${date} | ${title} | ${scope} | ${ticket}`);
    result.ids.push(id);
    result.moved.push({ file, id });
    n += 1;
  }
  if (lines.length > 0) {
    appendFileSync(indexPath, (index.endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n');
  }
  return result;
}

export function localDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const byTicket = args.length === 3 && args[1] === '--ticket' && args[2] !== '';
  if (args[0] !== 'adopt' || !(args.length === 1 || byTicket)) {
    process.stderr.write('usage: node vault/tools/research.mjs adopt\n');
    process.exit(2);
  }
  try {
    const researchDir = resolve(dirname(fileURLToPath(import.meta.url)), '../research');
    const { ids, skipped } = adopt(researchDir, localDate(), byTicket ? { ticket: args[2] } : {});
    for (const id of ids) process.stdout.write(id + '\n');
    for (const s of skipped) process.stderr.write(`research: skipped pending/${s.file}: ${s.reason}\n`);
    process.exit(skipped.length > 0 ? 1 : 0);
  } catch (err) {
    process.stderr.write(`research: ${err.message}\n`);
    process.exit(1);
  }
}
