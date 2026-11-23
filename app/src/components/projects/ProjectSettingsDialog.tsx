'use client';
// EZD-130 (Q-0699: a dialog like the New project dialog, the project fields on top and "Defaults for this
// project" below, Save and Cancel; Q-0697 decisions 03, 10; Q-0202; Q-0400; Q-0399; Q-0396; AC-EZD-130-3..6):
// Project settings, opened from the project switcher in the editor and loaded with app/src/lazy/project-settings.
// Fields this member may not change are plain text; with nothing to change there is no Save. Type and the
// defaults also need this tab to hold the edit lock. EZD-613 (S15g Decision 2): the project's own Code edition,
// changed with Edit model like the name. EZD-712 (S15c Decision 2; Q-0399 lifted): the project's Submittal
// profile, an active profile of the company, changed with Edit model through its own route; holders of
// settings_sheet_presets get a link to Settings > Sheet presets. EZD-643 (Q-0765): the Code edition select also
// offers FBC 8th ed. with NEC 2020 and By permit date (automatic), and the optional Permit application date sits
// under it, changed with Edit model like the edition. A failed
// save keeps the dialog open with a Try again message; a save hands the new settings to `onSaved`.
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  COMPANY_EDITION_DEFAULTS,
  companyEditionLabel,
  isCompanyEditionDefault,
} from '../../lib/code-edition/editions';
import { defaultRow } from '../../lib/defaults/registry';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import { PROJECT_ADDRESS_MAX, PROJECT_NAME_MAX, PROJECT_TYPES, SCOPE_OF_WORK_MAX, type ProjectType } from '../../lib/projects/new-project';
import {
  PROJECT_SETTINGS_DEFAULT_KEYS,
  canSaveAny,
  draftOf,
  editableFor,
  saveFailure,
  toPatchBody,
  type FieldErrors,
  type ProjectSettings,
  type ProjectSettingsDraft,
} from '../../lib/projects/project-settings';
import type { ProjectProfileAnswer } from '../../lib/submittal-profiles/profiles';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { InlineError } from '../states/InlineError';
import { Skeleton, SkeletonGroup } from '../states/Skeleton';
import { StateButton } from '../states/StateButton';
import { CustomerPicker } from './CustomerPicker';
import { SCOPE_TRADE_LABELS, ScopeTrades } from './ScopeTrades';
import styles from './NewProject.module.css';
import own from './ProjectSettings.module.css';

export type ProjectSettingsDialogProps = {
  projectId: string;
  // This tab holds the edit lock, and its epoch (EditorSession.lock.holding, model.lockEpoch).
  holding: boolean;
  lockEpoch: number;
  onClose: () => void;
  onSaved: (s: ProjectSettings) => void;
  fetchImpl?: typeof fetch;
};

const typeLabel = (type: ProjectType): MessageKey => `office.new_project.type_${type}`;

export type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; settings: ProjectSettings };

const settingsUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}/settings`;
const profileUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}/submittal-profile`;

export function ProjectSettingsDialog({
  projectId,
  holding,
  lockEpoch,
  onClose,
  onSaved,
  fetchImpl,
}: ProjectSettingsDialogProps): ReactElement {
  const t = useT();
  const online = useOnline();
  const doFetch = fetchImpl ?? fetch;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<ProjectSettingsDraft | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<ProjectProfileAnswer | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const read = async <T,>(url: string): Promise<T> => {
      const res = await doFetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    };
    Promise.all([read<ProjectSettings>(settingsUrl(projectId)), read<ProjectProfileAnswer>(profileUrl(projectId))])
      .then(([settings, prof]) => {
        if (!live) return;
        setLoad({ status: 'ready', settings });
        setDraft(draftOf(settings));
        setProfile(prof);
        setProfileId(prof.profileId);
      })
      .catch(() => {
        if (live) setLoad({ status: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [doFetch, projectId, attempt]);

  const settings = load.status === 'ready' ? load.settings : null;
  const editable = settings ? editableFor(settings, holding) : null;

  const save = async () => {
    if (!settings || !draft || !editable) return;
    const built = toPatchBody(settings, draft, editable, holding ? lockEpoch : null);
    if (!built.ok) {
      setFields(built.fields);
      return;
    }
    setFields({});
    setError(null);
    setBusy(true);
    try {
      // EZD-712: the profile first, through its own route; a refusal keeps the dialog open.
      if (editable.details && profile && profileId !== null && profileId !== profile.profileId) {
        const res = await doFetch(profileUrl(projectId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ profileId }),
        });
        if (!res.ok) {
          setError(
            res.status === 400 ? 'office.project_settings.profile_unavailable' : 'office.project_settings.save_failed',
          );
          setBusy(false);
          return;
        }
        setProfile({ ...profile, profileId });
      }
      const res = await doFetch(settingsUrl(projectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(built.body),
      });
      if (res.ok) {
        const next = (await res.json()) as ProjectSettings;
        setBusy(false);
        onSaved(next);
        return;
      }
      const failure = saveFailure(res.status, await res.json().catch(() => null));
      if (failure.kind === 'fields') setFields(failure.fields);
      else setError(failure.message);
    } catch {
      setError('office.project_settings.save_failed');
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
          data-testid="project-settings-dialog"
          data-load={load.status}
          lang={t.language}
          className={styles.content}
        >
          <ProjectSettingsContent
            load={load}
            draft={draft}
            holding={holding}
            fields={fields}
            error={error}
            busy={busy}
            online={online}
            profile={profile}
            profileId={profileId}
            onProfile={setProfileId}
            onDraft={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
            onRetry={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            onSave={() => void save()}
            onClose={() => {
              if (!busy) onClose();
            }}
            Title={Dialog.Title}
            Description={Dialog.Description}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Heading = (p: { className?: string; children?: ReactNode; 'data-testid'?: string }) => ReactNode;
const PlainTitle: Heading = ({ className, children, ...rest }) => (
  <h2 className={className} {...rest}>
    {children}
  </h2>
);
const PlainDescription: Heading = ({ className, children }) => <p className={className}>{children}</p>;

export type ProjectSettingsContentProps = {
  load: Load;
  draft: ProjectSettingsDraft | null;
  holding: boolean;
  fields: FieldErrors;
  error: MessageKey | null;
  busy: boolean;
  online: boolean;
  // EZD-712: the project's submittal profile and the company's choices (absent: the field is not shown).
  profile?: ProjectProfileAnswer | null;
  profileId?: string | null;
  onProfile?: (id: string) => void;
  onDraft: (patch: Partial<ProjectSettingsDraft>) => void;
  onRetry: () => void;
  onSave: () => void;
  onClose: () => void;
  // The dialog passes Radix's Title and Description; a test renders plain ones.
  Title?: Heading;
  Description?: Heading;
};

// The dialog's header, fields and footer (server-renderable: no effects, no portal).
export function ProjectSettingsContent({
  load,
  draft,
  holding,
  fields,
  error,
  busy,
  online,
  profile = null,
  profileId = null,
  onProfile,
  onDraft: set,
  onRetry,
  onSave,
  onClose,
  Title = PlainTitle,
  Description = PlainDescription,
}: ProjectSettingsContentProps): ReactElement {
  const t = useT();
  const settings = load.status === 'ready' ? load.settings : null;
  const editable = settings ? editableFor(settings, holding) : null;
  const canSave = editable !== null && canSaveAny(editable) && draft !== null;
  const fieldError = (key: string) =>
    fields[key] ? (
      <p className={styles.error} data-testid="project-settings-field-error" data-key={key}>
        {t(fields[key] as MessageKey)}
      </p>
    ) : null;
  const text = (testId: string, value: string) => (
    <p className={own.value} data-testid={testId} data-readonly="true">
      {value === '' ? '—' : value}
    </p>
  );

  let body: ReactElement;
  if (load.status === 'loading') {
    body = (
      <div className={styles.body} data-testid="project-settings-loading">
        <SkeletonGroup count={4}>
          <Skeleton height="36px" />
        </SkeletonGroup>
      </div>
    );
  } else if (load.status === 'failed' || !draft || !settings || !editable) {
    body = (
      <div className={styles.body} data-testid="project-settings-load-error">
        <InlineError
          message="office.project_settings.load_failed"
          onRetry={onRetry}
        />
      </div>
    );
  } else {
    const client = settings.client;
    body = (
      <div className={`${styles.body} ${own.scroll}`}>
        <div className={styles.field}>
          <span>{t('office.new_project.customer')}</span>
          {editable.client ? (
            <div data-testid="project-settings-customer">
              <CustomerPicker value={draft.client} onChange={(c) => set({ client: c })} />
            </div>
          ) : (
            text('project-settings-customer', client?.name ?? t('office.new_project.customer_none'))
          )}
          {client && client.email !== undefined && (draft.client?.id ?? null) === client.id ? (
            <p className={styles.hint} data-testid="project-settings-customer-contact">
              {client.phone
                ? t('office.new_project.customer_line', { email: client.email, phone: client.phone })
                : client.email}
            </p>
          ) : null}
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            {t('office.new_project.name')}
            {editable.details ? (
              <input
                data-testid="project-settings-name"
                className={`${styles.input} ${touch.target}`}
                type="text"
                maxLength={PROJECT_NAME_MAX}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            ) : (
              text('project-settings-name', draft.name)
            )}
            {fieldError('name')}
          </label>
          <label className={styles.field}>
            {t('office.new_project.type')}
            {editable.locked ? (
              <select
                data-testid="project-settings-type"
                className={`${styles.input} ${touch.target}`}
                value={draft.type}
                onChange={(e) => set({ type: e.target.value as ProjectType })}
              >
                {PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(typeLabel(type))}
                  </option>
                ))}
              </select>
            ) : (
              text('project-settings-type', t(typeLabel(draft.type)))
            )}
          </label>
        </div>
        <label className={styles.field}>
          {t('office.new_project.address')}
          {editable.details ? (
            <input
              data-testid="project-settings-address"
              className={`${styles.input} ${touch.target}`}
              type="text"
              maxLength={PROJECT_ADDRESS_MAX}
              value={draft.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          ) : (
            text('project-settings-address', draft.address)
          )}
          {fieldError('address')}
        </label>
        <label className={styles.field}>
          {t('office.new_project.scope')}
          {editable.details ? (
            <textarea
              data-testid="project-settings-scope"
              className={`${styles.input} ${own.scope}`}
              rows={3}
              maxLength={SCOPE_OF_WORK_MAX}
              value={draft.scopeOfWork}
              onChange={(e) => set({ scopeOfWork: e.target.value })}
            />
          ) : (
            text('project-settings-scope', draft.scopeOfWork)
          )}
          {fieldError('scopeOfWork')}
        </label>
        {editable.details ? (
          <ScopeTrades
            idPrefix="project-settings"
            value={draft.scopeTrades}
            onChange={(scopeTrades) => set({ scopeTrades })}
          />
        ) : (
          text(
            'project-settings-scope-trades',
            draft.scopeTrades.map((trade) => t(SCOPE_TRADE_LABELS[trade])).join(', '),
          )
        )}
        <label className={styles.field}>
          {t('office.project_settings.code_edition')}
          {editable.details ? (
            <select
              data-testid="project-settings-code-edition"
              className={`${styles.input} ${touch.target}`}
              value={draft.codeEdition}
              onChange={(e) => {
                const v = e.target.value;
                if (isCompanyEditionDefault(v)) set({ codeEdition: v });
              }}
            >
              {COMPANY_EDITION_DEFAULTS.map((e) => (
                <option key={e} value={e}>
                  {t(companyEditionLabel(e))}
                </option>
              ))}
            </select>
          ) : (
            text('project-settings-code-edition', t(companyEditionLabel(draft.codeEdition)))
          )}
        </label>
        <label className={styles.field}>
          {t('office.project_settings.permit_date')}
          {editable.details ? (
            <input
              data-testid="project-settings-permit-date"
              className={`${styles.input} ${touch.target}`}
              type="date"
              value={draft.permitApplicationDate}
              onChange={(e) => set({ permitApplicationDate: e.target.value })}
            />
          ) : (
            text('project-settings-permit-date', draft.permitApplicationDate)
          )}
          {fieldError('permitApplicationDate')}
        </label>
        {profile ? (
          <div className={styles.field}>
            <label className={styles.field}>
              {t('office.project_settings.submittal_profile')}
              {editable.details && profile.profiles.length > 0 ? (
                <select
                  data-testid="project-settings-submittal-profile"
                  className={`${styles.input} ${touch.target}`}
                  value={profileId ?? ''}
                  onChange={(e) => onProfile?.(e.target.value)}
                >
                  {profileId === null ? <option value="">{t('office.project_settings.profile_none')}</option> : null}
                  {profile.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.isDefault
                        ? t('office.project_settings.profile_default', { name: p.department })
                        : p.department}
                    </option>
                  ))}
                </select>
              ) : (
                text(
                  'project-settings-submittal-profile',
                  profile.profiles.find((p) => p.id === profileId)?.department ??
                    t('office.project_settings.profile_none'),
                )
              )}
            </label>
            {profile.canManage ? (
              <Link className={styles.hint} href="/settings/sheet-presets" data-testid="project-settings-sheet-presets-link">
                {t('office.project_settings.profile_manage')}
              </Link>
            ) : null}
          </div>
        ) : null}
        <section className={styles.block} data-testid="project-settings-defaults">
          <div className={styles.blockHead}>
            <span className={styles.blockTitle}>{t('office.project_settings.defaults_title')}</span>
          </div>
          {settings.can.typeAndDefaults && !holding ? (
            <p className={styles.hint} data-testid="project-settings-lock-hint">
              {t('office.project_settings.lock_hint')}
            </p>
          ) : null}
          <div className={own.grid}>
            {PROJECT_SETTINGS_DEFAULT_KEYS.map((key) => {
              const row = defaultRow(key);
              if (!row) return null;
              const value = draft.defaults[key] ?? '';
              const unit = row.unit === '%' ? '%' : '';
              return (
                <label key={key} className={styles.field} data-testid="project-settings-default" data-key={key}>
                  {t(row.label)}
                  {editable.locked ? (
                    <input
                      data-testid="project-settings-default-input"
                      className={`${styles.input} ${touch.target}`}
                      type="text"
                      inputMode={row.type === 'percent' ? 'decimal' : 'text'}
                      value={value}
                      placeholder={value === '' ? t('office.defaults.not_set') : undefined}
                      onChange={(e) =>
                        set({ defaults: { ...draft.defaults, [key]: e.target.value } })
                      }
                    />
                  ) : (
                    <p className={own.value} data-testid="project-settings-default-value" data-readonly="true">
                      {value === '' ? t('office.defaults.not_set') : `${value}${unit}`}
                    </p>
                  )}
                  {fieldError(key)}
                </label>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <div className={styles.headText}>
          <Title data-testid="project-settings-title" className={styles.title}>
            {t('office.project_settings.title')}
          </Title>
          <Description className={styles.subtitle}>
            {t('office.project_settings.subtitle')}
          </Description>
        </div>
        <StateButton
          variant="icon"
          data-testid="project-settings-close"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </StateButton>
      </div>
      {body}
      <div className={styles.footer}>
        {error ? (
          <p className={styles.error} role="alert" data-testid="project-settings-error">
            {t(error)}
          </p>
        ) : null}
        <span className={styles.spacer} />
        <StateButton data-testid="project-settings-cancel" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </StateButton>
        {canSave ? (
          <StateButton
            data-testid="project-settings-save"
            variant="primary"
            className={styles.createButton}
            disabled={busy || !online}
            onClick={onSave}
          >
            {busy ? t('office.editor.saving') : t('office.project_settings.save')}
          </StateButton>
        ) : null}
      </div>
    </>
  );
}
