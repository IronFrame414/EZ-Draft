// EZD-133 section 3 harness row `money/page-cases.ts` (vault/plans/EZD-133.md; C4): one case per page file, in
// listPages order. The path is the file less `app/src/app`, `(group)` segments and `/page.tsx`; `[section]`
// becomes each Settings slug but those with their own pages (OWN_PAGES), `[id]` the dev permissions project, and
// two dev pages take `?project=`. Test-only.
import { SETTINGS_SECTIONS } from '../../src/lib/settings/sections';

export type MoneyPageCase = { file: string; paths: (env: { projectId: string }) => string[] };

const PAGE_FILES = [
  'app/src/app/(client)/dev/entry/client/page.tsx',
  'app/src/app/(editor)/dev/entry/editor/page.tsx',
  'app/src/app/(editor)/dev/saves/[id]/page.tsx',
  'app/src/app/(editor)/projects/[id]/page.tsx',
  'app/src/app/(field)/dev/entry/field/page.tsx',
  'app/src/app/(office)/dev/entry/office/page.tsx',
  'app/src/app/(office)/dev/settings/page.tsx',
  'app/src/app/(office)/settings/[section]/page.tsx',
  'app/src/app/(office)/settings/company/page.tsx',
  'app/src/app/(office)/settings/libraries/page.tsx',
  'app/src/app/(office)/settings/system-status/page.tsx',
  'app/src/app/(office)/page.tsx',
  'app/src/app/(office)/settings/page.tsx',
  'app/src/app/(office)/settings/users/page.tsx',
  'app/src/app/auth/confirm/page.tsx',
  'app/src/app/dev/benchmark-plan/page.tsx',
  'app/src/app/dev/captcha/page.tsx',
  'app/src/app/dev/cloud-check/page.tsx',
  'app/src/app/dev/device/page.tsx',
  'app/src/app/dev/errors/page.tsx',
  'app/src/app/dev/header/page.tsx',
  'app/src/app/dev/jobs/page.tsx',
  'app/src/app/dev/lazy/page.tsx',
  'app/src/app/dev/messages/page.tsx',
  'app/src/app/dev/notifications/page.tsx',
  'app/src/app/dev/perf-probe/page.tsx',
  'app/src/app/dev/permissions/page.tsx',
  'app/src/app/dev/permissions/projects/[id]/page.tsx',
  'app/src/app/dev/realtime/page.tsx',
  'app/src/app/dev/shell/page.tsx',
  'app/src/app/dev/shell/rail/page.tsx',
  'app/src/app/dev/states/page.tsx',
  'app/src/app/dev/storage/page.tsx',
  'app/src/app/dev/sw-offline/shell/page.tsx',
  'app/src/app/dev/tokens/page.tsx',
  'app/src/app/dev/typed-bar/page.tsx',
  'app/src/app/invite/[token]/page.tsx',
  'app/src/app/sign-in/page.tsx',
  'app/src/app/terms/page.tsx',
] as const;

const WITH_PROJECT_QUERY = new Set([
  'app/src/app/dev/realtime/page.tsx',
  'app/src/app/dev/notifications/page.tsx',
]);

function basePath(file: string): string {
  const segments = file
    .replace(/^app\/src\/app\//, '')
    .replace(/(^|\/)page\.tsx$/, '')
    .split('/')
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  return '/' + segments.join('/');
}

// Settings slugs with their own page.tsx (EZD-131 adds libraries).
const OWN_PAGES = new Set(['company', 'users', 'system-status', 'libraries']);

function pathsFor(file: string, env: { projectId: string }): string[] {
  const base = basePath(file);
  if (base.includes('[section]')) {
    return SETTINGS_SECTIONS.filter(
      (s) => !OWN_PAGES.has(s.slug),
    ).map((s) => base.replace('[section]', s.slug));
  }
  if (base.includes('[id]')) return [base.replace('[id]', env.projectId)];
  // EZD-105: a token of the wrong shape, so the page shows its refusal and reads nothing.
  if (base.includes('[token]')) return [base.replace('[token]', 'not-a-token')];
  if (WITH_PROJECT_QUERY.has(file)) return [`${base}?project=${env.projectId}`];
  return [base];
}

export const MONEY_PAGE_CASES: readonly MoneyPageCase[] = PAGE_FILES.map((file) => ({
  file,
  paths: (env) => pathsFor(file, env),
}));
