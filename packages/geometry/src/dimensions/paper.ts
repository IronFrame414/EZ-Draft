// EZD-216 (09-calculations Q-0664 "Text paper sizes: ... Screen size = paper size × 96 px × zoom" and "Plan display
// scale: 96 CSS px per paper inch, so px per model inch = 96 × scale ÷ 12"; 09m Text paper size rows 1 to 5): a fixed
// paper size of text in model inches at a plan scale, and on screen at a zoom. Pure.

/** CSS px per paper inch at 100% zoom (Q-0664). */
export const PX_PER_PAPER_IN = 96;

/** Model inches of a paper size at a plan scale (plan inches per foot): paper × 12 ÷ scale. */
export function paperModelIn(paperIn: number, scale: number): number {
  return (paperIn * 12) / scale;
}

/** Screen px of a paper size at a zoom (1 = 100%): paper × 96 × zoom, whatever the scale. */
export function paperScreenPx(paperIn: number, zoom: number): number {
  return paperIn * PX_PER_PAPER_IN * zoom;
}
