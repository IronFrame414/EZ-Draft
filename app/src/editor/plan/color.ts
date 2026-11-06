// EZD-207a Build step 4 (vault/plans/EZD-207a.md Decided "Colour maths"; CSS Color 4 OKLab/OKLCH): design-token
// colours as sRGB channels 0..1 for the plan canvas. Reads TOKENS (app/src/styles/tokens.ts), never the DOM.
import { TOKENS } from '../../styles/tokens';

export type Rgb = { r: number; g: number; b: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const NUM = '([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)';
const OKLCH = new RegExp(`^oklch\\(\\s*${NUM}\\s+${NUM}\\s+${NUM}\\s*\\)$`, 'i');

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const transfer = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

export function parseCssColor(value: string): Rgb | null {
  const hex = HEX.exec(value);
  if (hex) {
    const digits = hex[1];
    const full = digits.length === 3 ? digits.replace(/./g, (c) => c + c) : digits;
    return {
      r: parseInt(full.slice(0, 2), 16) / 255,
      g: parseInt(full.slice(2, 4), 16) / 255,
      b: parseInt(full.slice(4, 6), 16) / 255,
    };
  }
  const ok = OKLCH.exec(value);
  if (!ok) return null;
  const L = Number(ok[1]);
  const C = Number(ok[2]);
  const H = (Number(ok[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: clamp01(transfer(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(transfer(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(transfer(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

export function tokenRgb(name: `--ez-${string}`): Rgb {
  const token = TOKENS.find((t) => t.name === name);
  const rgb = token ? parseCssColor(token.value) : null;
  if (rgb === null) throw new Error(`unknown colour token ${name}`);
  return rgb;
}
