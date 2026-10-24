// EZD-016d Step 3 (vault/plans/EZD-016d.md): Playwright global setup. Checks, in order, the gate secret
// (PS V3), the stub outbox folder (EZD-008a), the seed rows (PS Step 6; EZD-016c), then empties the outbox.
// It never prints or logs a secret. No import.meta (Q-0197 (b)).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adminDb } from '../rls/fixtures';
import { clearStubOutboxDir } from '../email-outbox';
import { clearSentryStubOutboxDir } from '../sentry-outbox';
import {
  JOSH_USER_ID,
  SEED_PROJECT_COUNT,
  TENANT_1_ID,
  TENANT_2_ID,
} from '../../test-utils/seed-ids';

export type SeedFound = {
  tenant1: boolean;
  josh: boolean;
  tenant2: boolean;
  tenant1Projects: number;
};

export function seedMissing(found: SeedFound): boolean {
  return (
    !found.tenant1 || !found.josh || !found.tenant2 || found.tenant1Projects !== SEED_PROJECT_COUNT
  );
}

async function rowExists(table: string, id: string): Promise<boolean> {
  const { data, error } = await adminDb().from(table).select('id').eq('id', id).maybeSingle();
  if (error) throw new Error(`Seed check failed on ${table}: ${error.code ?? 'error'}`);
  return data !== null;
}

async function readSeed(): Promise<SeedFound> {
  const { count, error } = await adminDb()
    .from('project')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_1_ID);
  if (error) throw new Error(`Seed check failed on project: ${error.code ?? 'error'}`);
  return {
    tenant1: await rowExists('tenant', TENANT_1_ID),
    josh: await rowExists('app_user', JOSH_USER_ID),
    tenant2: await rowExists('tenant', TENANT_2_ID),
    tenant1Projects: count ?? 0,
  };
}

export default async function globalSetup(): Promise<void> {
  if (!process.env.SUPABASE_API_GATE_SECRET) {
    throw new Error('Gate secret missing: run pnpm db:up');
  }
  const outbox = process.env.EMAIL_STUB_DIR;
  if (!outbox) throw new Error('EMAIL_STUB_DIR missing');
  // EZD-024 Re-validation V8: the Sentry stub folder, checked next to the email outbox.
  const sentryOutbox = process.env.SENTRY_STUB_DIR;
  if (!sentryOutbox) throw new Error('SENTRY_STUB_DIR missing');
  // EZD-021 Step 2: the AI stub folder and the app server's guard log, checked right after the Sentry folder.
  const aiStub = process.env.AI_STUB_DIR;
  if (!aiStub) throw new Error('AI_STUB_DIR missing');
  const guardLog = process.env.EZD_NET_GUARD_LOG;
  if (!guardLog) throw new Error('EZD_NET_GUARD_LOG missing');
  if (seedMissing(await readSeed())) throw new Error('Seed missing: run pnpm db:up');
  mkdirSync(outbox, { recursive: true });
  clearStubOutboxDir(outbox);
  mkdirSync(sentryOutbox, { recursive: true });
  clearSentryStubOutboxDir(sentryOutbox);
  // EZD-021 Step 2: an empty AI stub folder and an empty guard log.
  rmSync(aiStub, { recursive: true, force: true });
  mkdirSync(aiStub, { recursive: true });
  mkdirSync(path.dirname(guardLog), { recursive: true });
  writeFileSync(guardLog, '');
}
