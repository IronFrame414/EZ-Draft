'use client';

// EZD-118 Build step 15 (vault/plans/EZD-118.md Decided "One step", "Field order", "Type", "Default name",
// "Add new", "Create", "Close paths", "Dialog markup", "Touch targets"; board S01b column 1; S01 New project
// wizard; Q-0396; Q-0400; Q-0411; Q-0413): the one-step New project dialog. Nothing is saved until Create; an
// edited draft asks before it is discarded.
import { Dialog } from 'radix-ui';
import { useState, type ReactElement } from 'react';
import type { Customer } from '../../lib/customers/customers';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import {
  EMPTY_NEW_PROJECT,
  PROJECT_ADDRESS_MAX,
  PROJECT_NAME_MAX,
  PROJECT_TYPES,
  SCOPE_OF_WORK_MAX,
  applyType,
  canCreateProject,
  editName,
  isDraftEdited,
  toCreateBody,
  type NewProjectDraft,
  type ProjectType,
} from '../../lib/projects/new-project';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { CustomerDialog } from '../settings/company/CustomerDialog';
import { useConfirm } from '../states';
import { StateButton } from '../states/StateButton';
import { CustomerPicker } from './CustomerPicker';
import styles from './NewProject.module.css';

export type NewProjectDialogProps = {
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

const typeLabel = (type: ProjectType): MessageKey => `office.new_project.type_${type}`;

export function NewProjectDialog({ onClose, onCreated }: NewProjectDialogProps): ReactElement {
  const t = useT();
  const online = useOnline();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<NewProjectDraft>(EMPTY_NEW_PROJECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [adding, setAdding] = useState(false);

  const ready = canCreateProject(draft);

  const requestClose = async () => {
    if (busy) return;
    if (!isDraftEdited(draft)) {
      onClose();
      return;
    }
    const choice = await confirm({
      title: 'office.new_project.discard_title',
      message: 'office.new_project.discard_message',
      confirmLabel: 'office.new_project.discard_confirm',
      cancelLabel: 'office.new_project.keep_editing',
      tone: 'danger',
    });
    if (choice === 'confirm') onClose();
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(toCreateBody(draft)),
      });
      if (res.status === 201) {
        const body = (await res.json()) as { project: { id: string } };
        onCreated(body.project.id);
        return;
      }
      if (res.status === 403) {
        setError('error.not_authorized');
      } else if (res.status === 400) {
        const data: unknown = await res.json().catch(() => null);
        const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
        setError(
          code === 'customer_unavailable'
            ? 'error.project_customer_unavailable'
            : 'office.new_project.create_failed',
        );
      } else {
        setError('office.new_project.create_failed');
      }
    } catch {
      setError('office.new_project.create_failed');
    }
    setBusy(false);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) void requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content data-testid="new-project-dialog" lang={t.language} className={styles.content}>
          <div className={styles.header}>
            <div className={styles.headText}>
              <Dialog.Title data-testid="new-project-title" className={styles.title}>
                {t('office.new_project.title')}
              </Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                {t('office.new_project.subtitle')}
              </Dialog.Description>
            </div>
            <StateButton
              variant="icon"
              data-testid="new-project-close"
              aria-label={t('common.close')}
              onClick={() => void requestClose()}
            >
              <Icon name="close" size={20} />
            </StateButton>
          </div>
          <div className={styles.body}>
            <div className={styles.field}>
              <span>{t('office.new_project.customer')}</span>
              <CustomerPicker
                value={draft.customer}
                onChange={(c) => setDraft((d) => ({ ...d, customer: c }))}
              />
              <p className={styles.hint}>
                {t('office.new_project.customer_hint_before')}
                <button
                  type="button"
                  data-testid="new-project-customer-add"
                  className={`${styles.link} ${touch.hitArea}`}
                  onClick={() => setAdding(true)}
                >
                  {t('office.new_project.customer_hint_link')}
                </button>
                {t('office.new_project.customer_hint_after')}
              </p>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                {t('office.new_project.name')}
                <input
                  data-testid="new-project-name"
                  className={`${styles.input} ${touch.target}`}
                  type="text"
                  maxLength={PROJECT_NAME_MAX}
                  value={draft.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((d) => editName(d, value));
                  }}
                />
              </label>
              <label className={styles.field}>
                {t('office.new_project.type')}
                <select
                  data-testid="new-project-type"
                  className={`${styles.input} ${touch.target}`}
                  value={draft.type ?? ''}
                  onChange={(e) => {
                    const type = e.target.value as ProjectType;
                    const name = t('office.new_project.default_name', { type: t(typeLabel(type)) });
                    setDraft((d) => applyType(d, type, name));
                  }}
                >
                  <option value="" disabled>
                    {t('office.new_project.type_placeholder')}
                  </option>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(typeLabel(type))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.field}>
              {t('office.new_project.address')}
              <input
                data-testid="new-project-address"
                className={`${styles.input} ${touch.target}`}
                type="text"
                maxLength={PROJECT_ADDRESS_MAX}
                value={draft.address}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({ ...d, address: value }));
                }}
              />
            </label>
            <label className={styles.field}>
              {t('office.new_project.scope')}
              <textarea
                data-testid="new-project-scope"
                className={`${styles.input} ${touch.target}`}
                rows={4}
                maxLength={SCOPE_OF_WORK_MAX}
                value={draft.scopeOfWork}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({ ...d, scopeOfWork: value }));
                }}
              />
            </label>
            {error !== null ? (
              <p data-testid="new-project-error" role="alert" className={styles.error}>
                {t(error)}
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            {ready ? (
              <span data-testid="new-project-ready" className={styles.ready}>
                <Icon name="check_circle" size={16} />
                {t('office.new_project.ready')}
              </span>
            ) : null}
            <span className={styles.spacer} />
            <StateButton data-testid="new-project-cancel" onClick={() => void requestClose()}>
              {t('common.cancel')}
            </StateButton>
            <StateButton
              data-testid="new-project-create"
              variant="primary"
              className={styles.createButton}
              disabled={!ready || busy || !online}
              onClick={() => void create()}
            >
              {t('office.new_project.create')}
              <Icon name="arrow_forward" size={18} />
            </StateButton>
          </div>
          {adding ? (
            <CustomerDialog
              customer={null}
              onClose={() => setAdding(false)}
              onDone={(saved: Customer | null) => {
                setAdding(false);
                if (saved !== null) setDraft((d) => ({ ...d, customer: saved }));
              }}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
