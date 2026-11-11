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

export default {
  profile: 'desktop',
  panUrl: '/dev/benchmark-plan',
  measurements: [
    { id: 'js-size:editor', url: '/dev/benchmark-plan' },
    { id: 'js-size:sign-in', url: '/sign-in' },
    { id: 'js-size:auth-confirm', url: '/auth/confirm' },
    // EZD-020 Step 6: placeholder entry pages until the owner tickets repoint them.
    { id: 'js-size:projects-settings', url: '/dev/entry/office' },
    { id: 'js-size:field-pack', url: '/dev/entry/field' },
    { id: 'js-size:client-link', url: '/dev/entry/client' },
    { id: 'entry-contents:office', url: '/dev/entry/office' },
    { id: 'entry-contents:editor', url: '/dev/entry/editor' },
    { id: 'entry-contents:field-pack', url: '/dev/entry/field' },
    { id: 'entry-contents:client-link', url: '/dev/entry/client' },
    { id: 'entry-contents:sign-in', url: '/sign-in' },
    // EZD-235b Build step 10: the worker check runs on the perf probe page (no new page).
    { id: 'long-tasks-worker-job', url: '/dev/perf-probe?inject=worker-job' },
    { id: 'long-tasks-worker-job:ipad', url: '/dev/perf-probe?inject=worker-job' },
  ],
};
