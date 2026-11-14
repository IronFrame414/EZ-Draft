'use client';

// EZD-301 (S02 Entry "Upload of a new file to an existing project"; S01 Start from a file flow): the Upload step on
// an existing project. The editor header's Upload files button (Edit model) loads it with the edit menus' lazy
// module (one chunk entry, so the editor stays within its download budget); Continue to review sends the originals unchanged and starts the import, then shows a toast. Import review
// itself is EZD-307.
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { useRef, useState, type ReactElement } from 'react';
import {
  ImportUploadError,
  importReviewPath,
  uploadAndStartImport,
} from '../../lib/imports/upload-client';
import { emptyUploadList, type UploadList } from '../../lib/imports/upload-files';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import styles from '../../components/projects/NewProject.module.css';
import { Icon } from '../../components/icon/Icon';
import { StateButton } from '../../components/states/StateButton';
import { useToast } from '../../components/states/ToastProvider';
import { UploadStep } from '../../components/imports/UploadStep';

export function UploadFilesDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}): ReactElement {
  const t = useT();
  const online = useOnline();
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<UploadList>(() => emptyUploadList('pdf'));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(new Map<string, string>());

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const started: { jobId: string | null } = { jobId: null };
      await uploadAndStartImport(projectId, list.items, {
        done: done.current,
        onFile: (index, total) =>
          setStatus(t('office.upload.uploading', { index: index + 1, total })),
        onStarted: (id) => {
          started.jobId = id;
        },
      });
      toast.show({ message: 'office.upload.done' });
      onClose();
      // EZD-307 (S02 Entry points): a scan uploaded to an existing project opens Import review.
      if (started.jobId) router.push(importReviewPath(projectId, started.jobId));
      return;
    } catch (e) {
      const name = e instanceof ImportUploadError ? (e.fileName ?? '') : '';
      const code = e instanceof ImportUploadError ? e.code : 'upload_failed';
      setStatus(null);
      setError(
        code === 'not_authorized'
          ? t('office.upload.not_authorized', { name })
          : code === 'import_failed'
            ? t('office.upload.import_failed')
            : t('office.upload.failed', { name }),
      );
    }
    setBusy(false);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="upload-files-dialog"
          lang={t.language}
          className={styles.content}
        >
          <div className={styles.header}>
            <div className={styles.headText}>
              <Dialog.Title className={styles.title}>
                {t('office.upload.dialog_title')}
              </Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                {t('office.upload.dialog_sub')}
              </Dialog.Description>
            </div>
            <StateButton
              variant="icon"
              data-testid="upload-files-close"
              aria-label={t('common.close')}
              disabled={busy}
              onClick={onClose}
            >
              <Icon name="close" size={20} />
            </StateButton>
          </div>
          <div className={styles.body}>
            <UploadStep list={list} onChange={setList} disabled={busy} />
            {status !== null ? (
              <p data-testid="upload-files-status" role="status" className={styles.hint}>
                {status}
              </p>
            ) : null}
            {error !== null ? (
              <p data-testid="upload-files-error" role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            <span className={styles.spacer} />
            <StateButton data-testid="upload-files-cancel" disabled={busy} onClick={onClose}>
              {t('common.cancel')}
            </StateButton>
            <StateButton
              data-testid="upload-files-continue"
              variant="primary"
              className={styles.createButton}
              disabled={busy || !online || list.items.length === 0}
              onClick={() => void send()}
            >
              {t('office.new_project.continue_review')}
              <Icon name="arrow_forward" size={18} />
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
