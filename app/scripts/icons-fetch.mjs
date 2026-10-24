import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICON_COMMIT = '49d4db35df873165d6bd6ba09b063c7dafbac2f4';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.resolve(here, '../src/components/icon/svg');
const base = `https://raw.githubusercontent.com/google/material-design-icons/${ICON_COMMIT}`;

const names = process.argv.slice(2);
if (names.length === 0) {
  process.stderr.write('usage: icons-fetch.mjs <name>...\n');
  process.exit(1);
}

const writes = [];
const problems = [];
for (const name of names) {
  if (!/^[a-z0-9_]+(-fill)?$/.test(name)) {
    problems.push(`${name}: invalid name`);
    continue;
  }
  const isFill = name.endsWith('-fill');
  const b = isFill ? name.slice(0, -5) : name;
  const file = isFill ? `${b}_fill1_20px.svg` : `${b}_20px.svg`;
  const res = await fetch(`${base}/symbols/web/${b}/materialsymbolsoutlined/${file}`);
  if (res.status !== 200) {
    problems.push(`${name}: HTTP ${res.status}`);
    continue;
  }
  writes.push([path.join(svgDir, `${name}.svg`), await res.text()]);
}

const licensePath = path.join(svgDir, 'LICENSE');
if (!existsSync(licensePath)) {
  const res = await fetch(`${base}/LICENSE`);
  if (res.status !== 200) problems.push(`LICENSE: HTTP ${res.status}`);
  else writes.push([licensePath, await res.text()]);
}

if (problems.length) {
  process.stderr.write(problems.join('\n') + '\n');
  process.exit(1);
}
mkdirSync(svgDir, { recursive: true });
for (const [f, body] of writes) writeFileSync(f, body);
