// EZD-1905 (AC-EZD-1905-1): `@ezdraft/geometry/<area>` resolves for every folder under packages/geometry/src, and the
// root index keeps every export it had. The static imports below make the app typecheck resolve the "./*" export;
// the folder scan covers every folder, including one added later. The worker `workers/probe-job.ts` and the build
// reach `@ezdraft/geometry/benchmark` through the same pattern.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as rootIndex from '@ezdraft/geometry';
import * as benchmark from '@ezdraft/geometry/benchmark';
import * as cabinets from '@ezdraft/geometry/cabinets';
import * as countertops from '@ezdraft/geometry/countertops';
import * as rooms from '@ezdraft/geometry/rooms';

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/geometry/src',
);
const areas = readdirSync(SRC).filter((name) => statSync(path.join(SRC, name)).isDirectory());

// The 41 sources of packages/geometry/src/index.ts before this ticket (vault/plans/EZD-1905.md; AC-EZD-1905-1).
const ROOT_SOURCES = [
  './ceiling',
  './cabinets/elevation',
  './cabinets/run',
  './cabinets/edit',
  './cabinets/hosting',
  './cabinets/fit',
  './cabinets/autofill',
  './countertops/piece',
  './countertops/outline',
  './countertops/trace',
  './countertops/seam',
  './countertops/cutout',
  './countertops/panel',
  './countertops/schedule',
  './countertops/overhang',
  './countertops/support',
  './countertops/edge-profile',
  './derived',
  './drawing',
  './fixtures',
  './code-check',
  './length',
  './moves',
  './numbers',
  './openings',
  './plumbing/diagram',
  './plumbing/locations',
  './rooms',
  './rules/bearing',
  './schema',
  './options/apply',
  './selection',
  './sketch',
  './snap/index',
  './tile',
  './tolerance',
  './walls',
  './turn',
  './scene3d/wall-face',
  './scene3d/ceiling-mesh',
  './drawing/symbol-key',
];

describe('EZD-1905 geometry subpath exports', () => {
  it('the package exports every folder by subpath', () => {
    const pkg = JSON.parse(readFileSync(path.join(SRC, '../package.json'), 'utf8'));
    expect(pkg.exports).toEqual({ '.': './src/index.ts', './*': './src/*/index.ts' });
  });

  it('every folder under packages/geometry/src has an index.ts that @ezdraft/geometry/<area> resolves to', async () => {
    expect(areas).toEqual(
      expect.arrayContaining(['benchmark', 'cabinets', 'countertops', 'rooms', 'walls']),
    );
    for (const area of areas) {
      expect(statSync(path.join(SRC, area, 'index.ts')).isFile(), area).toBe(true);
      const mod = await import(`@ezdraft/geometry/${area}`);
      expect(Object.keys(mod).length, area).toBeGreaterThan(0);
    }
  });

  it('a subpath gives the same values as the root index (one module, not a copy)', () => {
    expect(cabinets.cabinetRunSummary).toBe(rootIndex.cabinetRunSummary);
    expect(rooms.roomAreaSqFt).toBe(rootIndex.roomAreaSqFt);
    for (const [name, value] of Object.entries(countertops))
      expect(rootIndex, name).toHaveProperty(name, value);
    expect(typeof benchmark.generateBenchmarkModel).toBe('function');
  });

  it('the benchmark generator stays out of the root index (EZD-229)', () => {
    expect(rootIndex).not.toHaveProperty('generateBenchmarkModel');
  });

  it('the root index keeps every export it had: its 41 sources, every name of each', async () => {
    const text = readFileSync(path.join(SRC, 'index.ts'), 'utf8');
    expect([...text.matchAll(/^export \* from '([^']+)';$/gm)].map((m) => m[1])).toEqual(
      ROOT_SOURCES,
    );
    for (const source of ROOT_SOURCES) {
      const mod = await import(/* @vite-ignore */ path.join(SRC, source));
      for (const [name, value] of Object.entries(mod))
        expect(rootIndex, `${source} ${name}`).toHaveProperty(name, value);
    }
  });
});
