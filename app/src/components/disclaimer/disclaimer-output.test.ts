// EZD-136 · U7: no job, lazy module, worker or geometry file names the disclaimer, so generated sheets and
// PDFs never carry it (vault/plans/EZD-136.md section 4; AC-EZD-136-2). Sources: AC-EZD-136-2; ARCH (PDFKit
// only in jobs; sheets, PDF and exporters lazy; geometry drawing list). L-019: files it could not read are
// counted and must be 0.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function repoRoot(): string {
  let d = process.cwd();
  while (!existsSync(path.join(d, 'pnpm-workspace.yaml'))) {
    const up = path.dirname(d);
    if (up === d) throw new Error('pnpm-workspace.yaml not found above ' + process.cwd());
    d = up;
  }
  return d;
}

const FOLDERS = [
  'app/src/server/jobs',
  'app/src/lazy',
  'app/src/workers',
  'packages/geometry/src',
  'worker/src',
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json']);
const NEEDLES = [
  'common.disclaimer',
  'components/disclaimer',
  'For design and planning only',
  'Solo para diseño y planificación',
];

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

describe('EZD-136 disclaimer outputs', () => {
  it('U7 not in outputs: no job, lazy, worker or geometry file names the disclaimer', () => {
    const root = repoRoot();
    expect(statSync(path.join(root, 'app/src/server/jobs')).isDirectory()).toBe(true);
    const files: string[] = [];
    for (const f of FOLDERS) {
      const dir = path.join(root, f);
      if (existsSync(dir)) walk(dir, files);
    }
    expect(files.length).toBeGreaterThan(0);
    const unreadable: string[] = [];
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        unreadable.push(path.relative(root, file));
        continue;
      }
      for (const n of NEEDLES)
        if (text.includes(n)) hits.push(`${path.relative(root, file)}: ${n}`);
    }
    expect(unreadable).toEqual([]);
    expect(hits).toEqual([]);
  });
});
