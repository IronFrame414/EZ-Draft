'use client';

// EZD-118 Build step 15 (vault/plans/EZD-118.md Decided "One step", "Field order", "Type", "Default name",
// "Add new", "Create", "Close paths", "Dialog markup", "Touch targets"; board S01b column 1; S01 New project
// wizard; Q-0396; Q-0400; Q-0411; Q-0413): the two-step New project dialog. Nothing is saved until Create; an
// edited draft asks before it is discarded.
// EZD-221b Build step 10 (vault/plans/EZD-221b.md Decided "Steps", "Step 2 header", "Create"; Q-0590 (a)): step 1
// is the details above with Next; step 2 (NewProjectStep2) recaps them, picks the template and Creates with it.
import { Dialog } from 'radix-ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { TemplateDraft } from '../../lazy/template-picker';
import type { Customer } from '../../lib/customers/customers';
import type { ForemanCandidate } from '../../lib/users/scope';
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
import { NewProjectStep2 } from './NewProjectStep2';
import { templateModule } from './template-module';

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
  const [step, setStep] = useState<1 | 2>(1);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const pendingFocus = useRef(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // EZD-129 (Q-0202; AC-EZD-129-3): the Foreman picked on step 2, sent as foremanId only when picked.
  const [foreman, setForeman] = useState<ForemanCandidate | null>(null);
  const ready = canCreateProject(draft);
  const read = template !== null ? templateModule.peek()?.readTemplate(template) : undefined;

  // After Next, focus Back; after Back or Edit, focus Project name (Decided "Steps").
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    (step === 2 ? backRef.current : nameRef.current)?.focus();
  }, [step]);

  const goToStep = (next: 1 | 2) => {
    pendingFocus.current = true;
    setStep(next);
  };

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
    if (read?.ok !== true) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...toCreateBody(draft),
          template: read.template,
          ...(foreman !== null ? { foremanId: foreman.membershipId } : {}),
        }),
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
            : code === 'foreman_unavailable'
              ? 'error.foreman_unavailable'
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
        <Dialog.Content
          data-testid="new-project-dialog"
          data-step={step}
          lang={t.language}
          className={step === 1 ? styles.content : `${styles.content} ${styles.contentWide}`}
        >
          <div className={styles.header}>
            <div className={styles.headText}>
              <Dialog.Title data-testid="new-project-title" className={styles.title}>
                {t('office.new_project.title')}
              </Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                {t('office.new_project.subtitle')}
              </Dialog.Description>
            </div>
            {step === 2 ? (
              <div data-testid="new-project-steps" className={styles.steps}>
                <div className={styles.step}>
                  <span className={styles.stepDone}>
                    <Icon name="check" size={15} />
                  </span>
                  <span className={styles.stepDoneLabel}>
                    {t('office.new_project.step_details')}
                  </span>
                </div>
                <span className={styles.stepLine} />
                <div className={styles.step}>
                  <span className={styles.stepOn}>2</span>
                  <span className={styles.stepOnLabel}>{t('office.new_project.step_source')}</span>
                </div>
              </div>
            ) : null}
            <StateButton
              variant="icon"
              data-testid="new-project-close"
              aria-label={t('common.close')}
              onClick={() => void requestClose()}
            >
              <Icon name="close" size={20} />
            </StateButton>
          </div>
          {step === 1 ? (
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
                    ref={nameRef}
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
                      const name = t('office.new_project.default_name', {
                        type: t(typeLabel(type)),
                      });
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
            </div>
          ) : (
            <NewProjectStep2
              draft={draft}
              template={template}
              busy={busy}
              error={error}
              onTemplateChange={setTemplate}
              onEdit={() => goToStep(1)}
              foreman={foreman}
              onForemanChange={setForeman}
            />
          )}
          <div className={styles.footer}>
            <span data-testid="new-project-step" className={styles.stepText}>
              {t('office.new_project.step_of', { step })}
            </span>
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
            {step === 1 ? (
              <StateButton
                data-testid="new-project-next"
                variant="primary"
                className={styles.createButton}
                disabled={!ready}
                onClick={() => goToStep(2)}
              >
                {t('office.new_project.next')}
                <Icon name="arrow_forward" size={18} />
              </StateButton>
            ) : (
              <>
                <StateButton
                  ref={backRef}
                  data-testid="new-project-back"
                  className={styles.createButton}
                  disabled={busy}
                  onClick={() => goToStep(1)}
                >
                  <Icon name="arrow_back" size={18} />
                  {t('office.new_project.back')}
                </StateButton>
                <StateButton
                  data-testid="new-project-create"
                  variant="primary"
                  className={styles.createButton}
                  disabled={!ready || busy || !online || read?.ok !== true}
                  onClick={() => void create()}
                >
                  {t('office.new_project.create')}
                  <Icon name="arrow_forward" size={18} />
                </StateButton>
              </>
            )}
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
