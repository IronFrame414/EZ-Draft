'use client';
// EZD-124 (S01 Card overflow menu, Controls; Q-0199; Q-0201; Q-0202; Q-0700 decisions 10; Q-0702): the three-dot
// menu on a project card (EZD-108 `Menu`, which has no submenus, so Set status is a labelled group of the five
// statuses), Rename inline, and the Delete dialog. Items the user lacks permission for are absent; with none the
// button is absent too.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import {
  SETTABLE_STATUSES,
  cardMenuItems,
  type CardActionsApi,
} from '../../lib/projects/project-card-menu';
import type { ProjectStatus, ProjectSummary } from '../../lib/projects/projects';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { Menu, MenuItem } from '../menu/Menu';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { ProjectCard } from './ProjectCard';
import styles from './Projects.module.css';

export type CardMenuHandlers = {
  onRename(): void;
  onStatus(status: ProjectStatus): void;
  onArchive(): void;
  onRestore(): void;
  onDelete(): void;
};

export function ProjectCardMenu({
  project,
  canEdit,
  canDelete,
  ...on
}: { project: ProjectSummary; canEdit: boolean; canDelete: boolean } & CardMenuHandlers):
  | ReactElement
  | null {
  const t = useT();
  const items = cardMenuItems({ canEdit, canDelete, archived: project.archived === true });
  if (items.length === 0) return null;
  const item = `${styles.menuItem} ${touch.target}`;
  return (
    <Menu
      label={t('office.projects.menu.label', { name: project.name })}
      trigger={<Icon name="more_horiz" size={20} />}
      triggerClassName={`${styles.cardMenuButton} ${touch.target}`}
      triggerTestId="project-card-menu"
      contentClassName={styles.menu}
      contentTestId="project-card-menu-items"
    >
      {items.includes('rename') ? (
        <MenuItem testId="project-card-rename" className={item} onSelect={on.onRename}>
          {t('office.projects.menu.rename')}
        </MenuItem>
      ) : null}
      {items.includes('status') ? (
        <>
          <div className={styles.menuLabel} data-testid="project-card-status-label">
            {t('office.projects.menu.set_status')}
          </div>
          {SETTABLE_STATUSES.map((s) => (
            <MenuItem
              key={s}
              testId={`project-card-status-${s}`}
              className={`${item}${s === project.status ? ` ${styles.menuItemOn}` : ''}`}
              onSelect={() => on.onStatus(s)}
            >
              {t(`office.projects.status.${s}`)}
            </MenuItem>
          ))}
        </>
      ) : null}
      {canEdit && canDelete ? <div role="separator" className={styles.menuDivider} /> : null}
      {items.includes('archive') ? (
        <MenuItem testId="project-card-archive" className={item} onSelect={on.onArchive}>
          {t('office.projects.menu.archive')}
        </MenuItem>
      ) : null}
      {items.includes('restore') ? (
        <MenuItem testId="project-card-restore" className={item} onSelect={on.onRestore}>
          {t('office.projects.menu.restore')}
        </MenuItem>
      ) : null}
      {items.includes('delete') ? (
        <MenuItem
          testId="project-card-delete"
          className={`${item} ${styles.menuItemDanger}`}
          onSelect={on.onDelete}
        >
          {t('office.projects.menu.delete')}
        </MenuItem>
      ) : null}
    </Menu>
  );
}

// Rename inline: Enter or leaving the field saves a trimmed, non-empty, changed name; Esc, or a blank name,
// keeps the old one.
export function RenameField({
  name,
  onDone,
}: {
  name: string;
  onDone(next: string | null): void;
}): ReactElement {
  const t = useT();
  const [value, setValue] = useState(name);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim();
    onDone(save && next !== '' && next !== name ? next : null);
  };
  return (
    <input
      ref={ref}
      className={styles.renameInput}
      data-testid="project-card-rename-input"
      aria-label={t('office.projects.menu.rename_label')}
      value={value}
      maxLength={1000}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

export type CardMenuConfig = {
  canEdit: boolean;
  canDelete: boolean;
  api: CardActionsApi;
  // After a change committed: the list and counts reload.
  onChanged(): void;
  // A change that did not save.
  onFailed(): void;
};

// One card with its menu, Rename inline and the Delete dialog.
export function ProjectCardWithMenu({
  project,
  config,
}: {
  project: ProjectSummary;
  config: CardMenuConfig;
}): ReactElement {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const run = (p: Promise<void>) =>
    p.then(
      () => config.onChanged(),
      () => config.onFailed(),
    );
  const menu = (
    <ProjectCardMenu
      project={project}
      canEdit={config.canEdit}
      canDelete={config.canDelete}
      onRename={() => setRenaming(true)}
      onStatus={(s) => {
        if (s !== project.status) void run(config.api.setStatus(project.id, s));
      }}
      onArchive={() => void run(config.api.setArchived(project.id, true))}
      onRestore={() => void run(config.api.setArchived(project.id, false))}
      onDelete={() => setDeleting(true)}
    />
  );
  return (
    <>
      <ProjectCard
        project={project}
        menu={menu}
        nameEditor={
          renaming ? (
            <RenameField
              name={project.name}
              onDone={(next) => {
                setRenaming(false);
                if (next !== null) void run(config.api.rename(project.id, next));
              }}
            />
          ) : undefined
        }
      />
      {deleting ? (
        <DeleteProjectDialog
          projectName={project.name}
          onClose={() => setDeleting(false)}
          onConfirm={(typed) =>
            config.api.remove(project.id, typed).then(
              () => config.onChanged(),
              (e: unknown) => {
                config.onFailed();
                throw e;
              },
            )
          }
        />
      ) : null}
    </>
  );
}
