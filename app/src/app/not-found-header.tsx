'use client';
// EZD-1990 (Q-0808; 11 Budgets): the signed-in not-found page's header and Back to Projects button in their own
// chunk, downloaded only when that page renders them (server-rendered, so they show with the page).
// React.lazy rather than next/dynamic: the root not-found file is in every entry, and next/dynamic's loader
// would add to each.
import { lazy, Suspense, type ReactElement } from 'react';
import type { ProjectsAccount } from '../components/projects/ProjectsHeader';

const Shell = lazy(() => import('./not-found-header-shell'));
const Back = lazy(() =>
  import('./not-found-header-shell').then((m) => ({ default: m.BackToProjects })),
);

export function NotFoundHeader({ account }: { account: ProjectsAccount }): ReactElement {
  return (
    <Suspense fallback={null}>
      <Shell account={account} />
    </Suspense>
  );
}

export function NotFoundBack({ label }: { label: string }): ReactElement {
  return (
    <Suspense fallback={null}>
      <Back label={label} />
    </Suspense>
  );
}
