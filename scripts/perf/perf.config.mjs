// EZD-017 Step 2 (vault/plans/EZD-017.md section 3 C-row): the default perf check config and the browser
// profiles. Imports nothing. PROFILES.desktop equals the browser harness's desktop project (EZD-016d; T13).
// The editor entry is /dev/shell until the editor route ticket (EZD-120b) repoints it (G11).

// EZD-207c: the iPad CPU slowdown rate (Q-0616 (a)).
const IPAD_CPU_THROTTLE = 4;

export const PROFILES = {
  desktop: {
    browser: 'chromium',
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    cpuThrottleRate: 1,
  },
  ipad: {
    browser: 'chromium',
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    hasTouch: false,
    isMobile: false,
    cpuThrottleRate: IPAD_CPU_THROTTLE,
  },
  'ipad-1x': {
    browser: 'chromium',
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    cpuThrottleRate: IPAD_CPU_THROTTLE,
  },
  // EZD-388: the iPad pan long-task row runs unthrottled and counts CPU time × the iPad rate (Q-0737 (a)).
  'ipad-cpu': {
    browser: 'chromium',
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    cpuThrottleRate: 1,
    cpuCountScale: IPAD_CPU_THROTTLE,
  },
};

// EZD-2000: the office session rows open with (run.mjs --office-storage-state).
const OFFICE = { session: 'office' };
// EZD-2000: every Settings section page (app/src/lib/settings/sections.ts slugs, each with its own page.tsx).
const SETTINGS_PAGES = [
  'company',
  'users',
  'title-block',
  'sheet-presets',
  'defaults',
  'catalog',
  'render-models',
  'code-edition',
  'libraries',
  'system-status',
];
// EZD-2000: an import job id that is no job, for the Import review page.
const NO_JOB = '00000000-0000-4000-8000-000000000000';

/** EZD-2000: a real page's download row and first-load contents row. */
function realPage(name, url, download, contents, extra = {}) {
  return [
    { id: `js-size:${name}`, url, budget: download, ...extra },
    { id: `entry-contents:${name}`, url, budget: contents, ...extra },
  ];
}

export default {
  profile: 'desktop',
  panUrl: '/dev/benchmark-plan',
  measurements: [
    // EZD-1995 (AC-EZD-1995-3): the projects-settings and editor download rows count the page's HTML too, where
    // its screen messages travel.
    { id: 'js-size:editor', url: '/dev/benchmark-plan', document: true },
    { id: 'js-size:sign-in', url: '/sign-in' },
    { id: 'js-size:auth-confirm', url: '/auth/confirm' },
    // EZD-1996 (AC-EZD-1996-3): the sign-in page's CSS alone.
    { id: 'css-size:sign-in', url: '/sign-in' },
    // EZD-020 Step 6: placeholder entry pages until the owner tickets repoint them.
    { id: 'js-size:projects-settings', url: '/dev/entry/office', document: true },
    // EZD-1998 (AC-EZD-1998-1): the real field pages of the seeded project the run is given (--project, signed in
    // with --storage-state), not the /dev/entry/field placeholder.
    { id: 'js-size:field-pack', url: '/projects/{project}/field' },
    { id: 'js-size:field-measure', url: '/projects/{project}/field-measure' },
    // EZD-1202: the real client link page; a token that is no link opens it signed out with the same page code.
    { id: 'js-size:client-link', url: '/c/not-a-token' },
    // EZD-1995 (AC-EZD-1995-3): the screen messages inside the same pages' HTML.
    { id: 'inline-messages:projects-settings', url: '/dev/entry/office' },
    { id: 'inline-messages:editor', url: '/dev/benchmark-plan' },
    { id: 'entry-contents:office', url: '/dev/entry/office' },
    { id: 'entry-contents:editor', url: '/dev/entry/editor' },
    { id: 'entry-contents:field-pack', url: '/projects/{project}/field' },
    { id: 'entry-contents:field-measure', url: '/projects/{project}/field-measure' },
    { id: 'entry-contents:client-link', url: '/c/not-a-token' },
    { id: 'entry-contents:sign-in', url: '/sign-in' },
    // EZD-235b Build step 10: the worker check runs on the perf probe page (no new page).
    { id: 'long-tasks-worker-job', url: '/dev/perf-probe?inject=worker-job' },
    { id: 'long-tasks-worker-job:ipad', url: '/dev/perf-probe?inject=worker-job' },
    // EZD-2000 (AC-EZD-2000-1 (1), (2), (4); Q-0814): every page route measured at its real page, its download on a
    // `download.*` row and its first load on a `contents.*` row (conventions check C12 fails a route without both).
    // Office pages open with the office session (run.mjs --office-storage-state), `{project}` is the seeded project.
    { id: 'js-size:projects', url: '/', budget: 'download.projects-settings', ...OFFICE },
    // The realtime allowance for this page is in eslint-rules/boundaries.mjs FIRST_LOAD_ALLOWANCES.
    { id: 'entry-contents:projects', url: '/', budget: 'contents.office', ...OFFICE },
    ...SETTINGS_PAGES.map((slug) =>
      realPage(`settings-${slug}`, `/settings/${slug}`, 'download.projects-settings', 'contents.office', OFFICE),
    ).flat(),
    // 11 Budgets: the editor's 500 KB is compressed JavaScript (CSS counted too since EZD-1996); the real page's HTML
    // is held on its own row, document-size:editor-project.
    ...realPage('editor-project', '/projects/{project}', 'download.editor', 'contents.editor', OFFICE),
    { id: 'document-size:editor-project', url: '/projects/{project}', budget: 'download.editor-document', ...OFFICE },
    // A job id that is no job: the review screen's code is the same, and it says the job is gone.
    ...realPage(
      'import-review',
      `/projects/{project}/import/${NO_JOB}`,
      'download.import-review',
      'contents.editor',
      OFFICE,
    ),
    ...realPage('supplier', '/projects/{project}/supplier', 'download.supplier', 'contents.editor', OFFICE),
    { id: 'entry-contents:auth-confirm', url: '/auth/confirm' },
    // Q-0072 (a): the invite page is a sign-in page; a token that is no invite opens it signed out.
    ...realPage('invite', '/invite/not-a-token', 'download.sign-in', 'contents.sign-in'),
    ...realPage('terms', '/terms', 'download.terms', 'contents.sign-in'),
    // EZD-1995 cap on the real Projects and editor pages: the screen messages inside their HTML.
    { id: 'inline-messages:projects', url: '/', budget: 'inline-messages.projects-page', ...OFFICE },
    {
      id: 'inline-messages:editor-project',
      url: '/projects/{project}',
      budget: 'inline-messages.editor-page',
      ...OFFICE,
    },
  ],
  // EZD-2000 (C12): page routes the gate cannot measure at a page of their own, each with its reason.
  unmeasuredRoutes: [
    {
      route: '/settings',
      reason:
        'it has no screen of its own: a user with any Settings right is sent on to the first section page they may open (each measured), and one with none sees No access inside the same Settings shell those pages use',
    },
    {
      route: '/settings/[section]',
      reason:
        'every Settings section has its own page (settings/<slug>/page.tsx), so this route only answers not found for an unknown slug; a new section without a page of its own is measured here',
    },
    {
      route: '/settings/billing',
      reason:
        'EZD-1711: the gate measures pages with the office session, which is Worth Properties (billing exempt, Q-0372), and for it this page answers not found (AC-EZD-1711-2), so there is no real page to measure; for a billed company it is the same Settings shell as the measured section pages plus one small panel (components/settings/billing), with no heavy library',
    },
  ],
};
