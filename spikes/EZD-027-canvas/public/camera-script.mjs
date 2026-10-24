// EZD-027 scripted pan and zoom (vault/plans/EZD-027.md Step 5). Pure. t in ms, 0-3,000.
// Zoom 1 = the whole extent fits the canvas.
export const PASS_MS = 3000;

export function cameraAt(t) {
  const tt = Math.min(Math.max(t, 0), PASS_MS);
  if (tt <= 1500) return { cx: 240 + (480 * tt) / 1500, cy: 360, zoom: 1 };
  if (tt <= 2250) return { cx: 720, cy: 360, zoom: Math.pow(8, (tt - 1500) / 750) };
  return { cx: 720, cy: 360, zoom: Math.pow(8, (PASS_MS - tt) / 750) };
}
