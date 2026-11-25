'use client';

// Editor header content (vault/plans/EZD-011b.md Step 3; 04 Header card).
import { Fragment, memo } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import { EDITOR_VIEWS, VIEW_LABEL_KEYS } from './editor-views';
import type { EditorView } from './editor-views';
import { HeaderCard } from './HeaderCard';
import { Wordmark } from './Wordmark';
import styles from './EditorHeader.module.css';

export type EditorHeaderProps = {
  projectsHref: string;
  projectName: string;
  onProjectMenu?: () => void;
  subtitle?: readonly ReactNode[];
  activeView: EditorView;
  views?: readonly EditorView[];
  onViewChange: (view: EditorView) => void;
  // EZD-1987 (audit F10; S12 board: Plan underlined): on a page under the project (Supplier markup), the active tab is
  // a link back to the project's editor at this href, keeping the active look.
  activeHref?: string;
  // EZD-126 (S06 Layout; 04:26): presence avatars before the review pill, Stop editing between it and Share.
  presence?: ReactNode;
  reviewPill?: ReactNode;
  stopEditing?: ReactNode;
  share?: ReactNode;
  export?: ReactNode;
  issueSet?: ReactNode;
};

export const EditorHeader = memo(function EditorHeader({
  projectsHref,
  projectName,
  onProjectMenu,
  subtitle,
  activeView,
  views = EDITOR_VIEWS,
  onViewChange,
  activeHref,
  presence,
  reviewPill,
  stopEditing,
  share,
  export: exportSlot,
  issueSet,
}: EditorHeaderProps) {
  const t = useT();
  const parts = (subtitle ?? []).filter(
    (p) => p !== null && p !== undefined && typeof p !== 'boolean' && p !== '',
  );
  return (
    <HeaderCard>
      <Wordmark href={projectsHref} />
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.titleBlock}>
        {onProjectMenu ? (
          <button type="button" className={styles.name} title={projectName} onClick={onProjectMenu}>
            <span className={styles.nameText}>{projectName}</span>
            <Icon name="expand_more" size={18} />
          </button>
        ) : (
          <span className={styles.name} title={projectName}>
            <span className={styles.nameText}>{projectName}</span>
          </span>
        )}
        {parts.length > 0 ? (
          <span className={styles.subtitle}>
            {parts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 ? <span aria-hidden="true"> · </span> : null}
                {part}
              </Fragment>
            ))}
          </span>
        ) : null}
      </div>
      <nav className={styles.views} aria-label={t('office.header.views')}>
        {EDITOR_VIEWS.filter((view) => views.includes(view)).map((view) => {
          const active = view === activeView;
          if (active && activeHref !== undefined) {
            return (
              <a key={view} className={`${styles.tab} ${styles.active}`} aria-current="page" href={activeHref}>
                {t(VIEW_LABEL_KEYS[view])}
              </a>
            );
          }
          return (
            <button
              key={view}
              type="button"
              className={active ? `${styles.tab} ${styles.active}` : styles.tab}
              aria-current={active ? 'page' : undefined}
              onClick={active ? undefined : () => onViewChange(view)}
            >
              {t(VIEW_LABEL_KEYS[view])}
            </button>
          );
        })}
      </nav>
      {presence}
      {reviewPill}
      {stopEditing}
      {share}
      {exportSlot}
      {issueSet}
    </HeaderCard>
  );
});
