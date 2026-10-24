// EZD-027 glyph atlas (vault/plans/EZD-027.md Step 3 Atlas row, Step 4). Printable ASCII
// U+0020-U+007E drawn once from DM Mono 400 (04 Type) into one canvas of at most 1024 x 1024
// (11 rule 6). No fallback font: a failed load throws, and the page goes to error.
export const FIRST_CHAR = 0x20;
export const LAST_CHAR = 0x7e;
const COLS = 16;
const CELL_W = 32;
const CELL_H = 64;
const SIZE = 512;
const FONT_PX = 48;
const FAMILY = 'EZD027 DM Mono';

export async function createAtlas() {
  const face = new FontFace(FAMILY, 'url(/fonts/dm-mono-latin-400-normal.woff2)');
  await face.load();
  document.fonts.add(face);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.font = `${FONT_PX}px "${FAMILY}"`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cells = new Map();
  for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    const i = code - FIRST_CHAR;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const ch = String.fromCharCode(code);
    ctx.fillText(ch, col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H / 2);
    cells.set(ch, { u: (col * CELL_W) / SIZE, v: (row * CELL_H) / SIZE });
  }
  return {
    canvas,
    width: SIZE,
    height: SIZE,
    bytesPerTexel: 4,
    cellUv: { u: CELL_W / SIZE, v: CELL_H / SIZE },
    cellAspect: CELL_W / CELL_H,
    cells,
  };
}
