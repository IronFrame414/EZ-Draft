'use client';
// EZD-1990 (Q-0808): the signed-in not-found page's client parts: the app header, with the toast and confirm
// host the avatar menu needs, and the Back to Projects button. Reached only through not-found-header.tsx's
// lazy import: the root not-found file sits in every route's tree, so a static import would add the header
// and next/link to every entry's download (11 Budgets).
import Link from 'next/link';
import type { ReactElement } from 'react';
import { ProjectsHeader, type ProjectsAccount } from '../components/projects/ProjectsHeader';
import { StateHost } from '../components/states/StateHost';
import buttonStyles from '../components/states/StateButton.module.css';
import touch from '../styles/touch.module.css';

export default function NotFoundHeaderShell({
  account,
}: {
  account: ProjectsAccount;
}): ReactElement {
  return (
    <StateHost>
      <ProjectsHeader account={account} search={null} />
    </StateHost>
  );
}

export function BackToProjects({ label }: { label: string }): ReactElement {
  return (
    <Link
      href="/"
      prefetch={false}
      className={`${buttonStyles.button} ${buttonStyles.primary} ${touch.target}`}
      data-testid="not-found-back"
    >
      {label}
    </Link>
  );
}
