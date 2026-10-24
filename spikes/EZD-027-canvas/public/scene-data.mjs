// EZD-027 scene data (vault/plans/EZD-027.md Step 3). Pure: no DOM, no three.
// Every value here is a spike input, not a product value, except the 150,000 segments and
// 3,000 symbols of the ticket.

export const EXTENT = { width: 960, height: 720 }; // inches (80' x 60'), 03 rule 5
export const LAYERS = 10;
export const SEGMENTS_PER_LAYER = 15000;
export const SYMBOL_TYPES = 10;
export const SYMBOLS_PER_TYPE = 300;
const MIN_LEN = 6;
const MAX_LEN = 96;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(x, y) {
  return x >= 0 && x <= EXTENT.width && y >= 0 && y <= EXTENT.height;
}

export function buildSceneData({ seed, labels }) {
  const rand = mulberry32(seed);
  const layers = [];
  let n = 0;
  for (let l = 0; l < LAYERS; l++) {
    const arr = new Float32Array(SEGMENTS_PER_LAYER * 6);
    for (let s = 0; s < SEGMENTS_PER_LAYER; s++, n++) {
      let x1, y1, x2, y2;
      do {
        x1 = rand() * EXTENT.width;
        y1 = rand() * EXTENT.height;
        const len = MIN_LEN + rand() * (MAX_LEN - MIN_LEN);
        const angle = n % 2 === 0 ? Math.floor(rand() * 4) * (Math.PI / 2) : rand() * 2 * Math.PI;
        x2 = x1 + len * Math.cos(angle);
        y2 = y1 + len * Math.sin(angle);
      } while (!inside(x2, y2));
      const o = s * 6;
      arr[o] = x1;
      arr[o + 1] = y1;
      arr[o + 2] = 0;
      arr[o + 3] = x2;
      arr[o + 4] = y2;
      arr[o + 5] = 0;
    }
    layers.push(arr);
  }

  const symbols = [];
  for (let type = 0; type < SYMBOL_TYPES; type++) {
    for (let i = 0; i < SYMBOLS_PER_TYPE; i++) {
      symbols.push({ type, x: rand() * EXTENT.width, y: rand() * EXTENT.height });
    }
  }

  const labelTexts = [];
  for (let i = 0; i < labels; i++) {
    const sym = symbols[i % symbols.length];
    labelTexts.push(`S${sym.type}-${String(i).padStart(5, '0')}`);
  }

  return { extent: { ...EXTENT }, layers, symbols, labels: labelTexts };
}

// The shell's canvas region (vault/plans/EZD-012.md Step 1; EZD-014: width W - 720; height H - 154).
export function canvasRegion(W, H) {
  return { x: 352, y: 92, width: W - 720, height: H - 154 };
}
