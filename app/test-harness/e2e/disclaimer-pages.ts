// EZD-136 section 3 (vault/plans/EZD-136.md): every page and not-found file outside app/src/app/dev/ that
// carries the disclaimer line, with the path a browser test opens, whether it needs a session and where the
// line sits. `file` is relative to app/. A later ticket that adds a page or a group not-found.tsx adds its row
// (test-author edit; U6 in app/src/components/disclaimer/disclaimer-pages.test.ts fails otherwise).
export type DisclaimerPage = {
  file: string;
  path: string;
  signedIn: boolean;
  placement: 'bar' | 'page';
};

export const DISCLAIMER_PAGES: readonly DisclaimerPage[] = [
  { file: 'src/app/page.tsx', path: '/', signedIn: true, placement: 'page' },
  { file: 'src/app/sign-in/page.tsx', path: '/sign-in', signedIn: false, placement: 'page' },
  {
    file: 'src/app/auth/confirm/page.tsx',
    path: '/auth/confirm',
    signedIn: false,
    placement: 'page',
  },
  {
    file: 'src/app/(office)/dev/entry/office/page.tsx',
    path: '/dev/entry/office',
    signedIn: false,
    placement: 'bar',
  },
  {
    file: 'src/app/(editor)/dev/entry/editor/page.tsx',
    path: '/dev/entry/editor',
    signedIn: false,
    placement: 'bar',
  },
  {
    file: 'src/app/(field)/dev/entry/field/page.tsx',
    path: '/dev/entry/field',
    signedIn: false,
    placement: 'page',
  },
  {
    file: 'src/app/(client)/dev/entry/client/page.tsx',
    path: '/dev/entry/client',
    signedIn: false,
    placement: 'page',
  },
  {
    file: 'src/app/(office)/settings/page.tsx',
    path: '/settings',
    signedIn: true,
    placement: 'bar',
  },
  {
    file: 'src/app/(office)/settings/[section]/page.tsx',
    path: '/settings/title-block',
    signedIn: true,
    placement: 'bar',
  },
  {
    file: 'src/app/(office)/dev/settings/page.tsx',
    path: '/dev/settings',
    signedIn: true,
    placement: 'bar',
  },
  { file: 'src/app/not-found.tsx', path: '/no-such-page', signedIn: true, placement: 'page' },
];
