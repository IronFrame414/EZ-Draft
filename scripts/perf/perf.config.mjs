// EZD-017 Step 2 (vault/plans/EZD-017.md section 3 C-row): the default perf check config and the browser
// profiles. Imports nothing. PROFILES.desktop equals the browser harness's desktop project (EZD-016d; T13).
// The editor entry is /dev/shell until the editor route ticket (EZD-120b) repoints it (G11).

export const PROFILES = {
  desktop: {
    browser: 'chromium',
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  },
};

export default {
  profile: 'desktop',
  panUrl: '/dev/shell',
  measurements: [
    { id: 'js-size:editor', url: '/dev/shell' },
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
  ],
};
