#!/usr/bin/env node
// Spec restructure (Q-0218; vault/questions/interview-plan-2026-10-20.md "Restructure and reading map").
//   node scripts/spec/split.mjs --apply   write the new area files and turn each old file into a pointer (run once)
// The manifest scripts/spec/splits.json names each old file, its heading in vault/spec/spec.md, and its new files with the
// source line ranges they hold. Text moves word for word: a new file is a title line, a source note, a blank line, then
// the moved lines. scripts/spec/split.test.mjs proves the moved text joined equals the original section.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_CHARS = 20000;
const HEADER_LINES = 3;

// The section of a Markdown document that starts at `heading`, up to the next heading of the same or a higher level.
export function specSection(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  const level = heading.match(/^#+/)[0].length;
  let end = start + 1;
  while (end < lines.length) {
    const m = lines[end].match(/^(#+) /);
    if (m && m[1].length <= level) break;
    end++;
  }
  return lines.slice(start, end).join('\n');
}

export const partBody = (text) => text.split('\n').slice(HEADER_LINES).join('\n');

// Every chunk of every part, put back in source-line order. Throws when a body does not hold the lines its ranges name.
export function assemble(entry, bodies) {
  const chunks = [];
  entry.parts.forEach((p, i) => {
    const lines = bodies[i].replace(/\n$/, '').split('\n');
    const want = p.lines.reduce((n, [a, b]) => n + b - a + 1, 0);
    if (lines.length !== want) throw new Error(`part ${i + 1}: line count ${lines.length}, ranges name ${want}`);
    let at = 0;
    for (const [a, b] of p.lines) {
      chunks.push({ a, text: lines.slice(at, at + b - a + 1) });
      at += b - a + 1;
    }
  });
  chunks.sort((x, y) => x.a - y.a);
  return chunks.flatMap((c) => c.text).join('\n') + '\n';
}

// The ranges must cover lines 1..lineCount once each.
export function rangeProblems(entry, lineCount) {
  const ranges = entry.parts.flatMap((p) => p.lines).sort((x, y) => x[0] - y[0]);
  const out = [];
  let next = 1;
  for (const [a, b] of ranges) {
    if (a > next) out.push(`gap: lines ${next}-${a - 1}`);
    if (a < next) out.push(`overlap at line ${a}`);
    next = Math.max(next, b + 1);
  }
  if (next !== lineCount + 1) out.push(`end: ranges stop at ${next - 1}, section has ${lineCount} lines`);
  return out;
}

function apply(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'scripts/spec/splits.json'), 'utf8'));
  for (const entry of manifest) {
    const src = readFileSync(path.join(root, entry.source), 'utf8');
    if (src.includes('Q-0218')) { console.log(`${entry.source}: already a pointer`); continue; }
    const lines = src.replace(/\n$/, '').split('\n');
    const problems = rangeProblems(entry, lines.length);
    if (problems.length) throw new Error(`${entry.source}: ${problems.join('; ')}`);
    for (const p of entry.parts) {
      const ranges = p.lines.map(([a, b]) => `${a}-${b}`).join(', ');
      const body = p.lines.flatMap(([a, b]) => lines.slice(a - 1, b));
      const note = `<!-- Moved word for word from ${entry.source} lines ${ranges} (Q-0218). Check: node --test scripts/spec/split.test.mjs -->`;
      writeFileSync(path.join(root, p.file), [`# ${p.title}`, note, '', ...body].join('\n') + '\n');
    }
    const links = entry.parts.map((p) => `- [${p.title}](${path.relative(path.dirname(entry.source), p.file)})${p.covers ? `: ${p.covers}` : ''}`);
    const pointer = [entry.heading, '', `${entry.pointer} No text was changed (Q-0218, 2026-10-20). Read only the file you need:`, '', ...links, ''];
    writeFileSync(path.join(root, entry.source), pointer.join('\n'));
    console.log(`${entry.source}: ${entry.parts.length} file(s) written`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--apply')) {
  apply(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
}
