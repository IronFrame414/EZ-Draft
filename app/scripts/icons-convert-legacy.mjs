// EZD-103a Step 1a (vault/plans/EZD-103a.md Decided "Legacy icon conversion"; Q-0322 (b)): converts an
// upstream icon in the legacy 20-unit format (no viewBox) to the 0 -960 960 960 box icons:build accepts.
// Run by hand only: node scripts/icons-convert-legacy.mjs <legacy.svg> <out.svg>. A refusal prints one line,
// exits 1 and writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LEGACY_RE =
  /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" height="20" width="20"><path d="([^"]*)"\/><\/svg>$/;
const TOKEN_RE = /[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)|[\s,]+|./g;
const SCALE = 48;
const Y_SHIFT = -960;

const args = process.argv.slice(2);
const problems = [];
if (args.length !== 2) problems.push('usage: icons-convert-legacy.mjs <legacy.svg> <out.svg>');

let output = null;
if (problems.length === 0) {
  let text = null;
  try {
    text = readFileSync(path.resolve(args[0]), 'utf8');
  } catch (e) {
    problems.push(`${args[0]}: cannot read (${e.message})`);
  }
  if (text !== null) {
    const m = LEGACY_RE.exec(text);
    if (!m) problems.push(`legacy_format_expected: ${args[0]}`);
    else {
      const d = convert(m[1], problems);
      if (d !== null) {
        output = text
          .replace('height="20" width="20"', 'height="20" viewBox="0 -960 960 960" width="20"')
          .replace(`d="${m[1]}"`, `d="${d}"`);
      }
    }
  }
}

if (problems.length) {
  process.stderr.write(problems[0] + '\n');
  process.exit(1);
}
writeFileSync(path.resolve(args[1]), output);

function fmt(v) {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}

// Returns the converted path data, or null with one problem recorded.
function convert(d, out) {
  const commands = [];
  for (const t of d.match(TOKEN_RE) ?? []) {
    if (/^[\s,]+$/.test(t)) continue;
    if (/^[A-Za-z]$/.test(t)) {
      if (!'MmLlHhVvZz'.includes(t)) {
        out.push(`unsupported_command ${t}`);
        return null;
      }
      commands.push({ letter: t, nums: [] });
      continue;
    }
    const n = Number(t);
    if (commands.length === 0 || !Number.isFinite(n)) {
      out.push('legacy_format_expected: path data');
      return null;
    }
    commands[commands.length - 1].nums.push(n);
  }
  if (commands.length === 0) {
    out.push('legacy_format_expected: path data');
    return null;
  }

  const parts = [];
  for (const [i, { letter, nums }] of commands.entries()) {
    const kind = letter.toUpperCase();
    const rel = letter !== kind;
    const per = kind === 'Z' ? 0 : kind === 'H' || kind === 'V' ? 1 : 2;
    if (per === 0 ? nums.length !== 0 : nums.length === 0 || nums.length % per !== 0) {
      out.push('legacy_format_expected: path data');
      return null;
    }
    if (kind === 'Z') {
      parts.push('Z');
      continue;
    }
    const mapped = nums.map((v, k) => {
      // SVG 1.1 8.3.3: the first pair of a leading moveto is absolute whatever the case.
      const absolute = !rel || (i === 0 && kind === 'M' && k < 2);
      if (!absolute) return v * SCALE;
      const isY = kind === 'V' || (per === 2 && k % 2 === 1);
      return isY ? v * SCALE + Y_SHIFT : v * SCALE;
    });
    parts.push(letter + mapped.map(fmt).join(' '));
  }
  return parts.join('');
}
