// EZD-1998 (AC-EZD-1998-1 "scripts/perf measures the real field pack and field measure pages (seeded project)"): the
// seeded project and signed-in session the perf CLI's field rows measure. A fresh company (never tenant 1) with one
// project holding an issued field pack (fixtures/field-pack.ts) and a crew member listed on it who may also send
// field measurements (S17 Decision 5 Crew preset plus Send field measurement, as field-measure-entry.spec.ts), so
// both /projects/<id>/field and /projects/<id>/field-measure open. The session is saved as a Playwright storage
// state for run.mjs --storage-state; the arguments returned go to every run.mjs call that measures a field row.
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signInAs } from '../test-harness/e2e/sign-in-as';
import {
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  setPermissions,
} from '../test-harness/e2e/test';
import { seedFieldPack } from './fixtures/field-pack';

const MEASURER = [
  'view_projects',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
] as const;

export type FieldPerfSession = { projectId: string; args: string[] };

// The browser fixture's shape this helper uses (conventions C7: only specs import @playwright/test).
type SessionPage = Parameters<typeof signInAs>[0];
type BrowserLike = {
  newContext(o: { baseURL: string }): Promise<{
    newPage(): Promise<SessionPage>;
    storageState(o: { path: string }): Promise<unknown>;
    close(): Promise<void>;
  }>;
};

export async function fieldPerfSession(
  browser: BrowserLike,
  baseURL: string,
): Promise<FieldPerfSession> {
  const tenant = await createTenant();
  const [projectId] = (await createProjects(tenant, 1)) as [string];
  await seedFieldPack(harnessSql(), {
    tenantId: tenant,
    projectId,
    rooms: ['Kitchen', 'Pantry'],
    taskCount: 3,
  });
  const member = await createMember({ tenantId: tenant, scope: 'listed', listed: [projectId] });
  await setPermissions(tenant, member.membershipId, [...MEASURER] as never);
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await signInAs(page, member.email);
    // The pages open signed in before the CLI measures them, so a lost session fails here and not as a size.
    for (const p of ['field', 'field-measure']) {
      const resp = await page.goto(`/projects/${projectId}/${p}`);
      if (
        resp?.status() !== 200 ||
        new URL(page.url()).pathname !== `/projects/${projectId}/${p}`
      ) {
        throw new Error(
          `perf field session: /projects/${projectId}/${p} answered ${resp?.status()} at ${page.url()}`,
        );
      }
    }
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'ezd-perf-session-')), 'state.json');
    await context.storageState({ path: file });
    return { projectId, args: ['--project', projectId, '--storage-state', file] };
  } finally {
    await context.close();
  }
}
