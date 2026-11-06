// EZD-346 W4 (vault/plans/EZD-346.md section 4; Decided D-Walk): the forms writeRoutes reads.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeRoutes } from './write-routes';

const ID = '00000000-0000-4000-8000-000000000000';

function put(root: string, rel: string, source: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('EZD-346 write route list', () => {
  it('W4 writeRoutes forms', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd346-routes-'));
    try {
      put(dir, 'app/api/a/route.ts', 'export async function POST() {}');
      put(dir, 'app/api/(grp)/b/[id]/route.ts', 'export const PATCH = () => {};');
      put(dir, 'app/api/c/[...slug]/route.ts', "export * from './x';");
      put(dir, 'app/api/d/route.ts', 'export function GET() {}\nexport function HEAD() {}');
      put(dir, 'app/feed/route.ts', 'export function POST() {}');
      expect(writeRoutes(dir)).toEqual([
        { file: 'app/src/app/api/(grp)/b/[id]/route.ts', method: 'PATCH', url: `/api/b/${ID}` },
        { file: 'app/src/app/api/a/route.ts', method: 'POST', url: '/api/a' },
        { file: 'app/src/app/api/c/[...slug]/route.ts', method: '*', url: `/api/c/${ID}` },
        { file: 'app/src/app/feed/route.ts', method: 'POST', url: '/feed' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
