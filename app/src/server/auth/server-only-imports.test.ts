// EZD-1932 (audit 2026-11-23 S8; AC-EZD-1932-3): the two files that read the secret key import 'server-only',
// and importing either from a 'use client' module fails lint (ezdraft/no-client-server-only on the real flat
// config). Messages are never compared, only messageId and severity.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RULE = 'ezdraft/no-client-server-only';
const SECRET_FILES = ['app/src/server/auth/admin-auth.ts', 'app/src/server/jobs/db.ts'];

let eslint: ESLint | null = null;
async function lint(code: string, filePath: string) {
  eslint ??= new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
  // A file that does not parse must not read as "0 reports".
  expect(result.messages.filter((m) => m.fatal)).toEqual([]);
  return result.messages
    .filter((m) => m.ruleId === RULE)
    .map((m) => ({ id: m.messageId, severity: m.severity }));
}

const CLIENT = 'app/src/components/probe/Probe.tsx';

describe('EZD-1932 the secret-key files are server-only', () => {
  it("EZD-1932 S1 admin-auth.ts and jobs/db.ts import 'server-only'", () => {
    for (const file of SECRET_FILES) {
      const text = readFileSync(path.join(repoRoot, file), 'utf8');
      expect(text, file).toMatch(/^import 'server-only';$/m);
    }
  });

  it("EZD-1932 S2 a 'use client' module importing either file fails lint", { timeout: 60000 }, async () => {
    const forms = [
      `import { createJobsDbClient } from '@/server/jobs/db';\nexport const f = createJobsDbClient;\n`,
      `import { createJobsDbClient } from '../../server/jobs/db';\nexport const f = createJobsDbClient;\n`,
      `import * as admin from '@/server/auth/admin-auth';\nexport const a = admin;\n`,
      `import * as admin from '../../server/auth/admin-auth';\nexport const a = admin;\n`,
      `export { createJobsDbClient } from '@/server/jobs/db';\n`,
      `export const load = () => import('@/server/auth/admin-auth');\n`,
    ];
    for (const body of forms) {
      expect(await lint(`'use client';\n${body}`, CLIENT), body).toEqual([
        { id: 'serverOnlyModule', severity: 2 },
      ]);
    }
    expect(await lint(`'use client';\nimport 'server-only';\n`, CLIENT)).toEqual([
      { id: 'serverOnlyPackage', severity: 2 },
    ]);
  });

  it('EZD-1932 S3 server code and type-only client imports stay clean', { timeout: 60000 }, async () => {
    const server = `import { createJobsDbClient } from '@/server/jobs/db';\nexport const f = createJobsDbClient;\n`;
    expect(await lint(server, 'app/src/app/api/probe/route.ts')).toEqual([]);
    const typeOnly = `'use client';\nimport type { createJobsDbClient } from '@/server/jobs/db';\nexport type F = typeof createJobsDbClient;\n`;
    expect(await lint(typeOnly, CLIENT)).toEqual([]);
    const plain = `'use client';\nimport { z } from 'zod';\nexport const s = z.string();\n`;
    expect(await lint(plain, CLIENT)).toEqual([]);
  });
});
