'use client';

// EZD-711 (S13 Controls "Property appraiser import (not in mockup) | Title block tool or checklist row | Paste PAO
// link; app reads parcel number, owner, legal description, year built, living area for user to confirm ... Edit
// model"; AC-EZD-711-1): the Sheets dialog. It loads the project's record, shows the link box with the saved fields
// ticked, and Save stores the ticked fields (PUT /api/projects/[id]/property-record); the title block then reloads.
import { Dialog } from 'radix-ui';
import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import { EMPTY_PROPERTY_FIELDS, type ProjectPropertyRecord } from '../../lib/property-record/fields';
import type { ConfirmedRecord } from '../../lib/property-record/property-record';
import type { MessageKey } from '../../server/messages/catalog';
import { Icon } from '../icon/Icon';
import { StateButton } from '../states/StateButton';
import { PropertyAppraiserLink, type PropertyAppraiserLinkProps } from './PropertyAppraiserLink';
import styles from './PropertyRecordDialog.module.css';

export type PropertyRecordDialogProps = {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
  fetchFn?: typeof fetch;
  channel?: PropertyAppraiserLinkProps['channel'];
};

export function PropertyRecordDialog({
  projectId,
  onClose,
  onSaved,
  fetchFn = fetch,
  channel,
}: PropertyRecordDialogProps): ReactElement {
  const t = useT();
  const online = useOnline();
  const [loaded, setLoaded] = useState<ProjectPropertyRecord | null>(null);
  const [record, setRecord] = useState<ConfirmedRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  useEffect(() => {
    let live = true;
    fetchFn(`/api/projects/${projectId}/property-record`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { record: ProjectPropertyRecord };
        if (live) setLoaded(body.record);
      })
      .catch(() => {
        if (live) setLoaded({ fields: EMPTY_PROPERTY_FIELDS, sourceUrl: null, leadFlag: false });
      });
    return () => {
      live = false;
    };
  }, [fetchFn, projectId]);

  const save = async () => {
    if (record === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchFn(`/api/projects/${projectId}/property-record`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(record),
      });
      if (res.ok) {
        onSaved();
        onClose();
        return;
      }
      setError(res.status === 403 ? 'error.not_authorized' : 'office.property_record.save_failed');
    } catch {
      setError('office.property_record.save_failed');
    }
    setBusy(false);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} data-testid="property-record-dialog">
          <div className={styles.head}>
            <div className={styles.titles}>
              <Dialog.Title className={styles.title}>{t('office.property_record.dialog_title')}</Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                {t('office.property_record.dialog_subtitle')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <StateButton variant="icon" aria-label={t('common.close')}>
                <Icon name="close" size={20} />
              </StateButton>
            </Dialog.Close>
          </div>
          {loaded === null ? (
            <p className={styles.note} role="status">
              {t('office.property_record.reading')}
            </p>
          ) : (
            <PropertyAppraiserLink
              projectId={projectId}
              initial={loaded}
              onChange={setRecord}
              disabled={!online || busy}
              fetchFn={fetchFn}
              channel={channel}
            />
          )}
          {error !== null ? (
            <p className={styles.error} role="alert" data-testid="property-record-save-error">
              {t(error)}
            </p>
          ) : null}
          <div className={styles.footer}>
            <Dialog.Close asChild>
              <StateButton variant="secondary">{t('common.cancel')}</StateButton>
            </Dialog.Close>
            <StateButton
              variant="primary"
              data-testid="property-record-save"
              disabled={record === null || busy || !online}
              onClick={() => void save()}
            >
              {t('office.property_record.save')}
            </StateButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
