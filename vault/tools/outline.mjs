#!/usr/bin/env node
// Prints a file's outline: Markdown headings to depth 2, or the top comment block and exported names of code.
// Usage: node vault/tools/outline.mjs <path>   (vault/PROCESS.md section 13; PA3-MECHANISMS.md Item 3)
//        node vault/tools/outline.mjs <plan> --section <n|header> [--section …]   print only those plan sections
//        node vault/tools/outline.mjs <plan> --sizes   characters per plan section (optimize plan C3)
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

// Plan sections (vault/plans/TEMPLATE.md): `header` is everything before the first `## `; a numbered section starts at
// `## <n>.` outside a code fence and runs to the next `## ` heading. Optimize plan C3: each role reads only its sections.
function splitSections(text) {
  const lines = text.split('\n');
  const starts = [];
  let fence = null;
  lines.forEach((line, i) => {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (!fence && /^##\s+\S/.test(line)) starts.push(i);
  });
  const out = [{ section: 'header', heading: lines[0] ?? '', from: 0 }];
  for (const i of starts) out.push({ section: lines[i].match(/^##\s+(\d+)\./)?.[1] ?? null, heading: lines[i].trimEnd(), from: i });
  return out.map((s, k) => {
    const to = k + 1 < out.length ? out[k + 1].from : lines.length;
    const body = lines.slice(s.from, to).join('\n') + (to < lines.length ? '\n' : '');
    return { ...s, body };
  }).filter((s) => s.section !== 'header' || s.body.length > 0);
}

export function sectionSizes(text) {
  return splitSections(text).filter((s) => s.section !== null).map(({ section, heading, body }) => ({ section, heading, chars: body.length }));
}

export function sections(text, wanted) {
  const all = splitSections(text);
  const numbered = all.filter((s) => s.section !== null && s.section !== 'header');
  const want = wanted.map(String);
  if (numbered.length === 0) return `NOTE: no numbered sections (${want.join(', ')}) in this plan; whole plan follows.\n` + text;
  const missing = want.filter((w) => !all.some((s) => s.section === w));
  if (missing.length) return `NOTE: section ${missing.join(', ')} not in this plan; whole plan follows.\n` + text;
  return all.filter((s) => want.includes(s.section)).map((s) => s.body).join('');
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

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
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
  const args = process.argv.slice(3);
  const wanted = args.flatMap((a, i) => (args[i - 1] === '--section' ? [a] : []));
  if (wanted.length) process.stdout.write(sections(text, wanted));
  else if (args.includes('--sizes')) {
    const rows = sectionSizes(text);
    process.stdout.write(rows.map((r) => `${r.section} ${r.chars} ${r.heading}`).join('\n') + `\ntotal ${text.length}\n`);
  } else process.stdout.write(outline(text, p).join('\n') + '\n');
}
