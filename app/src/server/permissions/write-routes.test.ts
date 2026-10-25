// EZD-102 U8 (vault/plans/EZD-102.md section 4; ticket row "Server check on every write"; Decided "Which
// writes need it"; L-006): every exported POST, PUT, PATCH or DELETE of a route file under app/src/app/ calls
// requireApiPermission(, no 'use server' file is a write path, and the only exceptions are the section 3
// write-exemptions list. Harness: app/test-harness/permissions/write-routes.ts, write-exemptions.ts.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WRITE_PERMISSION_EXEMPTIONS } from '../../../test-harness/permissions/write-exemptions';
import { uncheckedWrites, writeMethodsIn } from '../../../test-harness/permissions/write-routes';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const appSrc = path.join(repoRoot, 'app', 'src');
const exemptPaths = WRITE_PERMISSION_EXEMPTIONS.map((e) => e.path);

describe('EZD-102 server check on every write', () => {
  it('U8 (a) writeMethodsIn reads the four export forms and ignores GET-only files', () => {
    const samples = [
      'export async function PATCH(request: Request) { return new Response(null); }',
      'export function PATCH(request: Request) { return new Response(null); }',
      'export const PATCH = async (request: Request) => new Response(null);',
      'async function rename(request: Request) { return new Response(null); }\nexport { rename as PATCH };',
    ];
    for (const s of samples) expect(writeMethodsIn(s), s).toEqual(['PATCH']);
    expect(writeMethodsIn('export async function GET() { return new Response(null); }\n')).toEqual(
      [],
    );
  });

  it('U8 (b) every write route in app/src calls requireApiPermission( except the exemptions', () => {
    expect(uncheckedWrites(appSrc, exemptPaths)).toEqual([]);
  });

  it('U8 (c) a PATCH route without the call and a use server file are both reported', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd102-writes-'));
    try {
      mkdirSync(path.join(dir, 'app', 'api', 'probe'), { recursive: true });
      writeFileSync(
        path.join(dir, 'app', 'api', 'probe', 'route.ts'),
        'export async function PATCH(request: Request) {\n  return new Response(null);\n}\n',
      );
      mkdirSync(path.join(dir, 'server'), { recursive: true });
      writeFileSync(
        path.join(dir, 'server', 'act.ts'),
        "'use server';\nexport async function act() {\n  return 1;\n}\n",
      );
      expect(uncheckedWrites(dir, [])).toEqual([
        'app/src/app/api/probe/route.ts',
        'app/src/server/act.ts',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('U8 (d) every exemption path exists and has a reason', () => {
    expect(WRITE_PERMISSION_EXEMPTIONS.length).toBeGreaterThan(0);
    for (const e of WRITE_PERMISSION_EXEMPTIONS) {
      expect(existsSync(path.join(repoRoot, e.path)), e.path).toBe(true);
      expect(e.reason.trim().length, e.path).toBeGreaterThan(0);
    }
  });
});

// EZD-145 P4 (vault/plans/EZD-145.md section 4; D10): the dev jobs route checks permissions itself, so it
// leaves the exemption list; U8 (b) above stays [] with the entry gone.
describe('EZD-145 dev jobs route is no longer exempt', () => {
  it('P4 the exemption list does not hold the dev jobs route and the route calls requireApiPermission(', () => {
    const devJobsRoute = 'app/src/app/api/dev/jobs/route.ts';
    expect(WRITE_PERMISSION_EXEMPTIONS.map((e) => e.path)).not.toContain(devJobsRoute);
    expect(readFileSync(path.join(repoRoot, devJobsRoute), 'utf8')).toContain(
      'requireApiPermission(',
    );
  });
});
