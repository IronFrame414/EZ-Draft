'use client';
// EZD-124 (S01 Card overflow menu, Validation "Delete: type project name to confirm"; Q-0201; Q-0702; examples 09p
// Delete confirmation): the Delete dialog. Delete is enabled only when the trimmed text equals the project name
// exactly, case included. The content renders without the Radix portal so a test can read its markup.
import { AlertDialog } from 'radix-ui';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { useT } from '../../lib/messages';
import { deleteConfirmMatches } from '../../lib/projects/project-card-menu';
import touch from '../../styles/touch.module.css';
import { StateButton } from '../states/StateButton';
import styles from './Projects.module.css';

type Heading = (p: { className?: string; children?: ReactNode }) => ReactNode;
const PlainTitle: Heading = ({ className, children }) => <h2 className={className}>{children}</h2>;
const PlainDescription: Heading = ({ className, children }) => <p className={className}>{children}</p>;

export type DeleteProjectContentProps = {
  projectName: string;
  typed: string;
  busy: boolean;
  onTyped(v: string): void;
  onCancel(): void;
  onConfirm(): void;
  Title?: Heading;
  Description?: Heading;
};

export function DeleteProjectContent({
  projectName,
  typed,
  busy,
  onTyped,
  onCancel,
  onConfirm,
  Title = PlainTitle,
  Description = PlainDescription,
}: DeleteProjectContentProps): ReactElement {
  const t = useT();
  const id = useId();
  const ok = deleteConfirmMatches(projectName, typed);
  return (
    <form
      className={styles.deleteContent}
      data-testid="delete-project-dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) onConfirm();
      }}
    >
      <Title className={styles.deleteTitle}>
        {t('office.projects.delete.title', { name: projectName })}
      </Title>
      <Description className={styles.deleteMessage}>{t('office.projects.delete.message')}</Description>
      <label className={styles.deleteLabel} htmlFor={id}>
        {t('office.projects.delete.label')}
        <input
          id={id}
          className={styles.deleteInput}
          data-testid="delete-project-input"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onTyped(e.target.value)}
        />
      </label>
      <div className={styles.deleteActions}>
        <StateButton
          type="button"
          className={touch.target}
          data-testid="delete-project-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          {t('office.projects.delete.cancel')}
        </StateButton>
        <StateButton
          type="submit"
          variant="danger"
          className={touch.target}
          data-testid="delete-project-confirm"
          disabled={!ok || busy}
        >
          {t('office.projects.delete.confirm')}
        </StateButton>
      </div>
    </form>
  );
}

export function DeleteProjectDialog({
  projectName,
  onClose,
  onConfirm,
}: {
  projectName: string;
  onClose(): void;
  // Resolves when the delete is done; a rejection keeps the dialog open.
  onConfirm(typed: string): Promise<void>;
}): ReactElement {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog.Root
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.deleteOverlay} />
        <AlertDialog.Content lang={t.language} asChild>
          <div>
            <DeleteProjectContent
              projectName={projectName}
              typed={typed}
              busy={busy}
              onTyped={setTyped}
              onCancel={() => {
                if (!busy) onClose();
              }}
              onConfirm={() => {
                setBusy(true);
                onConfirm(typed).then(
                  () => onClose(),
                  () => setBusy(false),
                );
              }}
              Title={AlertDialog.Title}
              Description={AlertDialog.Description}
            />
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
