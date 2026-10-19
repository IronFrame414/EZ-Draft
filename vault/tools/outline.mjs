#!/usr/bin/env node
// Prints a file's outline: Markdown headings to depth 2, or the top comment block and exported names of code.
// Usage: node vault/tools/outline.mjs <path>   (vault/PROCESS.md section 13; PA3-MECHANISMS.md Item 3)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CODE = ['.mjs', '.cjs', '.js', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
const MAX = 60;
const WIDTH = 120;

const cut = (s) => (s.length > WIDTH ? s.slice(0, WIDTH - 1) + '…' : s);

function kindOf(filePath) {
  const m = String(filePath).toLowerCase().match(/\.[^./\\]+$/);
  const ext = m ? m[0] : '';
  if (ext === '.md') return 'md';
  return CODE.includes(ext) ? 'code' : 'other';
}

function markdown(lines) {
  const out = [];
  let fence = null;
  lines.forEach((line, i) => {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (!fence && /^#{1,2}\s+\S/.test(line)) out.push(`${i + 1}: ${line.trimEnd()}`);
  });
  return out;
}

function code(lines) {
  const out = [];
  let s = 0;
  if (lines[0] && lines[0].startsWith('#!')) s = 1;
  while (s < lines.length && lines[s].trim() === '') s++;
  if (s < lines.length) {
    if (lines[s].trim().startsWith('//')) {
      for (let i = s; i < lines.length && lines[i].trim().startsWith('//'); i++) out.push(lines[i].trimEnd());
    } else if (lines[s].startsWith('/*')) {
      for (let i = s; i < lines.length; i++) {
        out.push(lines[i].trimEnd());
        if (lines[i].includes('*/')) break;
      }
    }
  }
  const re = /^export\s+(default\s+)?(async\s+)?(function\b|class\b|const\b)|^export\s+(default\s+)?abstract\s+class\b/;
  lines.forEach((line, i) => { if (re.test(line)) out.push(`${i + 1}: ${line.trim()}`); });
  return out;
}

export function outline(text, filePath) {
  const lines = text.split('\n');
  const kind = kindOf(filePath);
  let entries = kind === 'md' ? markdown(lines) : kind === 'code' ? code(lines) : [];
  if (entries.length === 0) {
    const n = lines.length - (text.endsWith('\n') ? 1 : 0);
    entries = [`${n} lines; nothing to outline.`];
  }
  if (entries.length > MAX) entries = [...entries.slice(0, MAX - 1), `… ${entries.length - (MAX - 1)} more not shown`];
  return entries.map(cut);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = process.argv[2];
  if (!p) {
    process.stderr.write('usage: node vault/tools/outline.mjs <path>\n');
    process.exit(2);
  }
  let text;
  try { text = readFileSync(p, 'utf8'); } catch (e) {
    process.stderr.write(`cannot read ${p}: ${e.code || e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(outline(text, p).join('\n') + '\n');
}
