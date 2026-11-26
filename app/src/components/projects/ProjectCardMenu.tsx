'use client';
// EZD-124 (S01 Card overflow menu, Controls; Q-0199; Q-0201; Q-0202; Q-0700 decisions 10; Q-0702): the three-dot
// menu on a project card (EZD-108 `Menu`, which has no submenus, so Set status is a labelled group of the five
// statuses), Rename inline, and the Delete dialog. Items the user lacks permission for are absent; with none the
// button is absent too.
// EZD-137 (Q-0191; Q-0702; Q-0700 decisions 10): Mark complete after Set status; a completed card offers Reopen.
// EZD-1419 (S17b Entry points; Q-0178 "any staff member may be sent mid-job to re-measure"): Field measure, first,
// opens the project's phone Field measure screen for a member who may measure (Send field measurement) or reopen
// sent rooms (Approve field measurements), so the menu shows for them too.
// EZD-1422 (Q-0204): while the card waits for field measurements, the sender or a member with Edit model gets
// Resend field measure link, Copy field measure link and Cancel field measure request (the server decides again).
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
import type { FieldMeasureRequestSent } from '../../lib/projects/field-measure-request';
import { DeleteProjectDialog } from './DeleteProjectDialog';
import { ProjectCard } from './ProjectCard';
import styles from './Projects.module.css';

/** EZD-1419: the phone Field measure screen of a project. */
export const fieldMeasureHref = (projectId: string): string =>
  `/projects/${projectId}/field-measure`;

export type CardMenuHandlers = {
  onRename(): void;
  onStatus(status: ProjectStatus): void;
  onComplete(): void;
  onReopen(): void;
  onArchive(): void;
  onRestore(): void;
  onDelete(): void;
  // EZD-1422: shown with a waiting field measure request the user may change.
  onFieldMeasureResend?(): void;
  onFieldMeasureCopy?(): void;
  onFieldMeasureCancel?(): void;
};

export function ProjectCardMenu({
  project,
  canEdit,
  canDelete,
  canMeasure = false,
  ...on
}: {
  project: ProjectSummary;
  canEdit: boolean;
  canDelete: boolean;
  canMeasure?: boolean;
} & CardMenuHandlers): ReactElement | null {
  const t = useT();
  const items = cardMenuItems({
    canEdit,
    canDelete,
    archived: project.archived === true,
    complete: project.status === 'complete',
  });
  const wait = project.fieldMeasureWait;
  const canChangeRequest =
    !!wait && (wait.mine || canEdit) && on.onFieldMeasureResend !== undefined;
  if (items.length === 0 && !canMeasure && !canChangeRequest) return null;
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
      {canMeasure ? (
        <MenuItem
          testId="project-card-field-measure"
          className={item}
          onSelect={() => window.location.assign(fieldMeasureHref(project.id))}
        >
          {t('office.projects.menu.field_measure')}
        </MenuItem>
      ) : null}
      {canChangeRequest ? (
        <>
          <MenuItem
            testId="project-card-field-measure-resend"
            className={item}
            onSelect={() => on.onFieldMeasureResend?.()}
          >
            {t('office.projects.menu.field_measure_resend')}
          </MenuItem>
          <MenuItem
            testId="project-card-field-measure-copy"
            className={item}
            onSelect={() => on.onFieldMeasureCopy?.()}
          >
            {t('office.projects.menu.field_measure_copy')}
          </MenuItem>
          <MenuItem
            testId="project-card-field-measure-cancel"
            className={item}
            onSelect={() => on.onFieldMeasureCancel?.()}
          >
            {t('office.projects.menu.field_measure_cancel')}
          </MenuItem>
        </>
      ) : null}
      {(canMeasure || canChangeRequest) && items.length > 0 ? (
        <div role="separator" className={styles.menuDivider} />
      ) : null}
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
      {items.includes('complete') ? (
        <MenuItem testId="project-card-complete" className={item} onSelect={on.onComplete}>
          {t('office.projects.menu.complete')}
        </MenuItem>
      ) : null}
      {items.includes('reopen') ? (
        <MenuItem testId="project-card-reopen" className={item} onSelect={on.onReopen}>
          {t('office.projects.menu.reopen')}
        </MenuItem>
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
  /** EZD-1419: offer Field measure (Send field measurement or Approve field measurements). */
  canMeasure?: boolean;
  api: CardActionsApi;
  // EZD-1422 (Q-0204): after Resend (who got the link, and whether the email went) and Copy link.
  onFieldMeasureResent?(sent: FieldMeasureRequestSent): void;
  onFieldMeasureCopied?(): void;
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
      canMeasure={config.canMeasure === true}
      onRename={() => setRenaming(true)}
      onStatus={(s) => {
        if (s !== project.status) void run(config.api.setStatus(project.id, s));
      }}
      onComplete={() => void run(config.api.setComplete(project.id, true))}
      onReopen={() => void run(config.api.setComplete(project.id, false))}
      onArchive={() => void run(config.api.setArchived(project.id, true))}
      onRestore={() => void run(config.api.setArchived(project.id, false))}
      onDelete={() => setDeleting(true)}
      onFieldMeasureResend={() =>
        void fieldMeasureRequest(project.id, 'POST').then(
          (sent) => {
            if (sent !== null) config.onFieldMeasureResent?.(sent);
            config.onChanged();
          },
          () => config.onFailed(),
        )
      }
      onFieldMeasureCopy={() =>
        void navigator.clipboard
          .writeText(window.location.origin + fieldMeasureHref(project.id))
          .then(
            () => config.onFieldMeasureCopied?.(),
            () => config.onFailed(),
          )
      }
      onFieldMeasureCancel={() =>
        void fieldMeasureRequest(project.id, 'DELETE').then(
          () => config.onChanged(),
          () => config.onFailed(),
        )
      }
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

/** EZD-1422 (Q-0204): Resend (POST) or Cancel (DELETE) the card's field measure request; throws when refused. */
export async function fieldMeasureRequest(
  projectId: string,
  method: 'POST' | 'DELETE',
): Promise<FieldMeasureRequestSent | null> {
  const res = await fetch(`/api/projects/${projectId}/field-measure/request`, {
    method,
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`field_measure_request_${res.status}`);
  return method === 'POST' ? ((await res.json()) as FieldMeasureRequestSent) : null;
}
