// EZD-013 Step 4 (vault/plans/EZD-013.md): renders app/src/pwa/app-icon.html to the five icon PNGs.
// Run by hand: pnpm --filter @ezdraft/app app-icons:render. Never run by tests or the gate.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(app, 'src/pwa/app-icon.html');
const outputs = [
  ['public/app-icons/icon-192.png', 192],
  ['public/app-icons/icon-512.png', 512],
  ['public/app-icons/icon-maskable-512.png', 512],
  ['src/app/apple-icon.png', 180],
  ['src/app/icon.png', 48],
];

for (const [rel, size] of outputs) {
  const out = path.join(app, rel);
  const r = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'screenshot',
      '--browser',
      'chromium',
      '--viewport-size',
      `${size}, ${size}`,
      '--wait-for-selector',
      "html[data-ready='1']",
      `file://${page}`,
      out,
    ],
    { cwd: app, stdio: 'inherit' },
  );
  if (r.status !== 0) process.exit(1);
}
