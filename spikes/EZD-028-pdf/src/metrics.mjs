// EZD-028 text metrics from the bundled font files (vault/plans/EZD-028.md Step 2; 02 PDF out).
// Widths are the sum of fontkit's layout advances x size / unitsPerEm, in paper points.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkit';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fontsDir = path.join(repoRoot, 'app', 'src', 'styles', 'fonts');

/** `sans` = Instrument Sans 400, `mono` = DM Mono 400 (04 Type), EZD-010's committed files. */
export const FONT_FILES = {
  sans: path.join(fontsDir, 'instrument-sans-latin-400-normal.woff2'),
  mono: path.join(fontsDir, 'dm-mono-latin-400-normal.woff2'),
};

const cache = new Map();

/** @param {'sans' | 'mono'} font */
function load(font) {
  const file = FONT_FILES[font];
  if (!file) throw new Error(`unknown font ${font}`);
  let loaded = cache.get(font);
  if (!loaded) {
    loaded = create(readFileSync(file));
    cache.set(font, loaded);
  }
  return loaded;
}

/**
 * Width of `text` in paper points at `size` pt.
 * @param {'sans' | 'mono'} font
 * @param {string} text
 * @param {number} size
 * @returns {number}
 */
export function textWidth(font, text, size) {
  const face = load(font);
  const run = face.layout(text);
  let advance = 0;
  for (const position of run.positions) advance += position.xAdvance;
  return (advance * size) / face.unitsPerEm;
}
