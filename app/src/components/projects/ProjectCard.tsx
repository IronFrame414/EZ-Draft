// EZD-117a Step 12 (vault/plans/EZD-117a.md Decided "Card", "Strings"; section 3 card testids; S01 Controls,
// Data shown; Q-0394; Q-0403): one project card. The thumbnail slot is empty (CSS grid only).
// EZD-120c Build step 8 (vault/plans/EZD-120c.md; Q-0500; ARCH Entry points): the card is a link that opens the
// project in the editor, without prefetch (no role, tabIndex or click handler).
import Link from 'next/link';
import type { ReactElement } from 'react';
import type { ProjectSummary } from '../../lib/projects/projects';
import { useT } from '../../lib/messages';
import styles from './Projects.module.css';

export function ProjectCard({ project }: { project: ProjectSummary }): ReactElement {
  const t = useT();
  const hasItems = project.openItems > 0;
  return (
    <Link
      href={'/projects/' + project.id}
      prefetch={false}
      className={styles.card}
      data-testid="project-card"
      data-project-id={project.id}
      data-status={project.status}
    >
      <div className={styles.thumb} aria-hidden="true" data-testid="project-card-thumb" />
      <div className={styles.body}>
        <div className={styles.top}>
          <h2 className={styles.name} data-testid="project-card-name">
            {project.name}
          </h2>
          <span
            className={styles.pill}
            data-testid="project-card-status"
            data-status={project.status}
          >
            {t(`office.projects.status.${project.status}`)}
          </span>
        </div>
        <span className={styles.place} data-testid="project-card-place">
          {project.clientName === null
            ? project.address
            : t('office.projects.card.place', {
                client: project.clientName,
                address: project.address,
              })}
        </span>
        <div className={styles.bottom}>
          <span className={styles.version} data-testid="project-card-version">
            {t('office.projects.card.working_copy')}
          </span>
          <span
            className={styles.open}
            data-testid="project-card-open"
            data-open-items={project.openItems}
            data-has-items={hasItems ? 'true' : 'false'}
          >
            <span className={styles.dot} />
            {hasItems
              ? t('office.projects.card.to_review', { count: project.openItems })
              : t('office.projects.card.nothing_to_review')}
          </span>
        </div>
      </div>
    </Link>
  );
}
