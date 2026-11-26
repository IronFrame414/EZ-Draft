'use client';

// EZD-117a Step 12 (vault/plans/EZD-117a.md Decided "Card", "Strings"; section 3 card testids; S01 Controls,
// Data shown; Q-0394; Q-0403): one project card.
// EZD-120c Build step 8 (vault/plans/EZD-120c.md; Q-0500; ARCH Entry points): the card is a link that opens the
// project in the editor, without prefetch (no role, tabIndex or click handler).
// EZD-224 Build step 11 (vault/plans/EZD-224.md Decided "Card image"; Q-0664; Q-0403): with a stored thumbnail the
// slot shows a lazy 220 x 128 img from /api/projects/<id>/thumbnail (a signed link); without one it stays empty.
// EZD-124 (S01 Card overflow menu; Q-0702): with a `menu` the card sits in a wrapper with the three-dot menu
// beside the link (never inside it, so a menu click does not open the project); with a `nameEditor` (Rename
// inline) the card is not a link while the name is edited.
// EZD-1422 (Q-0204): while the wizard's field measure request waits, the card shows "Waiting for field measurements"
// in place of the open-items line and who it was sent to under the place line; Resend, Copy link and Cancel are in
// the three-dot menu (ProjectCardMenu).
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { projectThumbnailSrc, type ProjectSummary } from '../../lib/projects/projects';
import { useT } from '../../lib/messages';
import styles from './Projects.module.css';

export function ProjectCard({
  project,
  menu,
  nameEditor,
}: {
  project: ProjectSummary;
  menu?: ReactNode;
  nameEditor?: ReactNode;
}): ReactElement {
  const inner = <CardInner project={project} nameEditor={nameEditor} />;
  const card =
    nameEditor === undefined ? (
      <Link
        href={'/projects/' + project.id}
        prefetch={false}
        className={styles.card}
        data-testid="project-card"
        data-project-id={project.id}
        data-status={project.status}
      >
        {inner}
      </Link>
    ) : (
      <div
        className={styles.card}
        data-testid="project-card"
        data-project-id={project.id}
        data-status={project.status}
        data-renaming="true"
      >
        {inner}
      </div>
    );
  if (menu === undefined) return card;
  return (
    <div
      className={styles.cardWrap}
      data-testid="project-card-wrap"
      data-project-id={project.id}
      data-archived={project.archived ? 'true' : 'false'}
    >
      {card}
      <div className={styles.cardMenu}>{menu}</div>
    </div>
  );
}

function CardInner({
  project,
  nameEditor,
}: {
  project: ProjectSummary;
  nameEditor?: ReactNode;
}): ReactElement {
  const t = useT();
  const hasItems = project.openItems > 0;
  return (
    <>
      <div className={styles.thumb} aria-hidden="true" data-testid="project-card-thumb">
        {project.hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 900 s signed Storage link behind a redirect (Q-0664)
          <img
            className={styles.thumbImg}
            src={projectThumbnailSrc(project.id)}
            alt=""
            width={220}
            height={128}
            loading="lazy"
            decoding="async"
            data-testid="project-card-thumb-img"
          />
        ) : null}
      </div>
      <div className={styles.body}>
        <div className={styles.top}>
          {nameEditor ?? (
            <h2 className={styles.name} data-testid="project-card-name">
              {project.name}
            </h2>
          )}
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
        {project.fieldMeasureWait ? (
          <span className={styles.place} data-testid="project-card-field-measure-sent-to">
            {t('office.projects.card.field_measure_sent_to', {
              name: project.fieldMeasureWait.sentTo,
            })}
          </span>
        ) : null}
        <div className={styles.bottom}>
          <span className={styles.version} data-testid="project-card-version">
            {/* EZD-121 (S01 Data shown; Q-0700 05): "Version N" after a send, "Working copy" before. */}
            {project.versionNo == null
              ? t('office.projects.card.working_copy')
              : t('office.projects.card.version', { n: project.versionNo })}
          </span>
          {project.fieldMeasureWait ? (
            <span
              className={styles.open}
              data-testid="project-card-field-measure-waiting"
              data-has-items="true"
            >
              <span className={styles.dot} />
              {t('office.projects.card.field_measure_waiting')}
            </span>
          ) : project.importing === true ? (
            // EZD-314 (S01 States "Import in progress: card shows Importing in place of the open-items
            // indicator"; AC-EZD-314-5).
            <span
              className={styles.open}
              data-testid="project-card-importing"
              data-has-items="true"
            >
              <span className={styles.dot} />
              {t('office.projects.card.importing')}
            </span>
          ) : (
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
          )}
        </div>
      </div>
    </>
  );
}
