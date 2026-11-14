'use client';

// EZD-221b Build step 8 (vault/plans/EZD-221b.md Decided "Step 2 columns", "Template block load"; board
// S01bWizard.dc.html:101-185; S01 Template picker; Q-0396; Q-0398; Q-0399; Q-0401; Q-0214): New project step 2.
// Column 1 recaps step 1 with Edit, column 2 shows the Blank (template) source and the template picker (a lazy
// module, app/src/lazy/template-picker/, loaded here with its own loading and Retry states), column 3 the
// units and what Create will do.
// EZD-129 (boards S01bForeman, S01bForemanStates; Q-0202): column 3 holds the optional Foreman picker, and
// Create will lists "Add it to <name>'s listed projects" when the picked person's access is Listed.
// EZD-301 (board S01b column 2; S01 Start from a file flow; Q-0189; Q-0398): entered through Start from a file, the
// built file sources (Polycam scan, PDF, DXF, Supplier kitchen PDF) replace Blank and the Upload step replaces the
// template block, and Create will lists the upload; Standalone keeps Blank only (vault/build/assumptions.md).
import { useEffect, useState, type ReactElement } from 'react';
import { FILE_SOURCES, type FileSource, type UploadList } from '../../lib/imports/upload-files';
import type { IconName } from '../icon/icon-names.generated';
import { UploadStep } from '../imports/UploadStep';
import type { TemplateDraft } from '../../lazy/template-picker';
import { useT } from '../../lib/messages';
import type { NewProjectDraft } from '../../lib/projects/new-project';
import { initialsFor } from '../../lib/users/initials';
import { foremanGetsListed, foremanName, type ForemanCandidate } from '../../lib/users/scope';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { InlineError, Skeleton, SkeletonGroup } from '../states';
import { ForemanPicker } from './ForemanPicker';
import styles from './NewProject.module.css';
import { templateModule } from './template-module';

export type NewProjectStep2Props = {
  draft: NewProjectDraft;
  template: TemplateDraft | null;
  busy: boolean;
  error: MessageKey | null;
  onTemplateChange: (d: TemplateDraft) => void;
  onEdit: () => void;
  // EZD-129: the Foreman picker; shown when onForemanChange is given.
  foreman?: ForemanCandidate | null;
  onForemanChange?: (f: ForemanCandidate | null) => void;
  // EZD-301: the input source and, for a file source, the Upload step's list and its status line.
  source?: InputSource;
  onSourceChange?: (s: InputSource) => void;
  uploads?: UploadList;
  onUploadsChange?: (l: UploadList) => void;
  uploadStatus?: string | null;
  uploadError?: string | null;
  locked?: boolean;
};

export type InputSource = 'blank' | FileSource;

const SOURCE_ICONS: Record<FileSource, IconName> = {
  polycam: 'photo_camera',
  pdf: 'description',
  dxf: 'layers',
  supplier_pdf: 'kitchen',
};

export function NewProjectStep2({
  draft,
  template,
  busy,
  error,
  onTemplateChange,
  onEdit,
  foreman = null,
  onForemanChange,
  source = 'blank',
  onSourceChange,
  uploads,
  onUploadsChange,
  uploadStatus = null,
  uploadError = null,
  locked = false,
}: NewProjectStep2Props): ReactElement {
  const t = useT();
  const [mod, setMod] = useState(() => templateModule.peek());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (mod) return;
    let live = true;
    templateModule.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [mod, attempt]);

  useEffect(() => {
    if (mod && template === null) onTemplateChange(mod.initialTemplateDraft());
  }, [mod, template, onTemplateChange]);

  const state = mod ? 'ready' : failed ? 'error' : 'loading';
  const customer = draft.customer;
  const templateKey = template?.key ?? null;

  return (
    <div className={styles.cols}>
      <div data-testid="new-project-recap" className={styles.col1}>
        <div className={styles.secRow}>
          <span className={styles.sec}>{t('office.new_project.recap_title')}</span>
          <button
            type="button"
            data-testid="new-project-recap-edit"
            className={`${styles.link} ${touch.hitArea}`}
            disabled={busy || locked}
            onClick={onEdit}
          >
            {t('office.new_project.recap_edit')}
          </button>
        </div>
        <div className={styles.field}>
          <span>{t('office.new_project.customer')}</span>
          <div className={styles.recapBox}>
            {customer !== null ? (
              <>
                <span className={styles.avatar}>{initialsFor(customer.name, customer.email)}</span>
                <span className={styles.who}>
                  <span>{customer.name}</span>
                  <span className={styles.line}>
                    {customer.phone !== null
                      ? t('office.new_project.customer_line', {
                          email: customer.email,
                          phone: customer.phone,
                        })
                      : customer.email}
                  </span>
                </span>
              </>
            ) : (
              t('office.new_project.customer_none')
            )}
          </div>
        </div>
        <div className={styles.field}>
          <span>{t('office.new_project.name')}</span>
          <div className={styles.recapBox}>{draft.name}</div>
        </div>
        <div className={styles.field}>
          <span>{t('office.new_project.type')}</span>
          <div className={styles.recapBox}>
            {draft.type !== null ? t(`office.new_project.type_${draft.type}`) : null}
          </div>
        </div>
        <div className={styles.field}>
          <span>{t('office.new_project.address')}</span>
          <div className={styles.recapBox}>{draft.address}</div>
        </div>
        {draft.scopeOfWork.trim() !== '' ? (
          <div className={styles.field}>
            <span>{t('office.new_project.scope')}</span>
            <div className={`${styles.recapBox} ${styles.recapScope}`}>{draft.scopeOfWork}</div>
          </div>
        ) : null}
      </div>

      <div className={styles.col2}>
        <div className={styles.secRow}>
          <span className={styles.sec}>{t('office.new_project.source_title')}</span>
        </div>
        <div
          className={
            onSourceChange === undefined
              ? styles.sourceGrid
              : `${styles.sourceGrid} ${styles.sourceGridFiles}`
          }
          role="radiogroup"
          aria-label={t('office.new_project.source_title')}
        >
          {onSourceChange !== undefined
            ? FILE_SOURCES.map((s) => (
                <SourceCard
                  key={s}
                  testId={`new-project-source-${s}`}
                  icon={SOURCE_ICONS[s]}
                  name={t(`office.new_project.source_${s}`)}
                  sub={t(`office.new_project.source_${s}_sub`)}
                  on={source === s}
                  disabled={busy || locked}
                  onPick={() => onSourceChange(s)}
                />
              ))
            : null}
          {onSourceChange === undefined ? (
            <div data-testid="new-project-source-blank" className={styles.source}>
              <span className={styles.sourceTop}>
                <span className={styles.sourceIcon}>
                  <Icon name="dashboard" size={20} />
                </span>
                <span className={styles.sourceRadio}>
                  <Icon name="radio_button_checked" size={20} />
                </span>
              </span>
              <span className={styles.sourceName}>{t('office.new_project.source_blank')}</span>
              <span className={styles.sourceSub}>{t('office.new_project.source_blank_sub')}</span>
            </div>
          ) : null}
        </div>
        {source !== 'blank' && uploads !== undefined && onUploadsChange !== undefined ? (
          <div data-testid="new-project-upload-block" className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>{t('office.upload.files_title')}</span>
              <span className={styles.blockSub}>{t('office.new_project.source_pick')}</span>
            </div>
            <UploadStep list={uploads} onChange={onUploadsChange} disabled={busy} />
            {uploadStatus !== null ? (
              <p data-testid="new-project-upload-status" role="status" className={styles.hint}>
                {uploadStatus}
              </p>
            ) : null}
            {uploadError !== null ? (
              <p data-testid="new-project-upload-error" role="alert" className={styles.error}>
                {uploadError}
              </p>
            ) : null}
          </div>
        ) : null}
        {source === 'blank' ? (
          <div data-testid="new-project-template-block" data-state={state} className={styles.block}>
            <div className={styles.blockHead}>
              <span className={styles.blockTitle}>{t('office.new_project.template_title')}</span>
              <span className={styles.blockSub}>{t('office.new_project.template_sub')}</span>
            </div>
            {mod ? (
              template !== null ? (
                <mod.TemplatePicker value={template} onChange={onTemplateChange} />
              ) : null
            ) : failed ? (
              <InlineError
                message="office.new_project.template_load_failed"
                onRetry={() => {
                  setFailed(false);
                  setAttempt((a) => a + 1);
                }}
              />
            ) : (
              <SkeletonGroup count={1}>
                <Skeleton width="100%" height="160px" />
              </SkeletonGroup>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.col3}>
        <span className={styles.sec}>{t('office.new_project.settings_title')}</span>
        <div data-testid="new-project-units" className={styles.field}>
          <span>{t('office.new_project.units')}</span>
          <div className={`${styles.recapBox} ${styles.unitsBox}`}>
            {t('office.new_project.units_value')}
            <span className={styles.unitsPrecision}>{t('office.new_project.units_precision')}</span>
          </div>
          <span className={styles.hint}>{t('office.new_project.units_hint')}</span>
        </div>
        {onForemanChange !== undefined ? (
          <ForemanPicker value={foreman} onChange={onForemanChange} disabled={busy} />
        ) : null}
        {error !== null ? (
          <p data-testid="new-project-error" role="alert" className={styles.error}>
            {t(error)}
          </p>
        ) : null}
        <span className={styles.spacer} />
        <div data-testid="new-project-create-will" className={styles.createWill}>
          <span className={styles.createWillTitle}>{t('office.new_project.create_will')}</span>
          <span className={styles.createWillRow}>
            <Icon name="check" size={16} />
            {t('office.new_project.create_will_make', { name: draft.name })}
          </span>
          {foremanGetsListed(foreman) && foreman !== null ? (
            <span data-testid="new-project-create-will-foreman" className={styles.createWillRow}>
              <Icon name="check" size={16} />
              {t('office.new_project.create_will_foreman', { name: foremanName(foreman) })}
            </span>
          ) : null}
          {source !== 'blank' ? (
            <>
              <span data-testid="new-project-create-will-upload" className={styles.createWillRow}>
                <Icon name="check" size={16} />
                {t('office.new_project.create_will_upload', { count: uploads?.items.length ?? 0 })}
              </span>
              <span className={styles.createWillRow}>
                <Icon name="check" size={16} />
                {t('office.new_project.create_will_open_project')}
              </span>
            </>
          ) : (
            <span className={styles.createWillRow}>
              <Icon name="check" size={16} />
              {templateKey !== null
                ? t('office.new_project.create_will_open', {
                    template: t(`office.new_project.template_${templateKey}`),
                  })
                : t('office.new_project.create_will_open_empty')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  testId,
  icon,
  name,
  sub,
  on,
  disabled,
  onPick,
}: {
  testId: string;
  icon: IconName;
  name: string;
  sub: string;
  on: boolean;
  disabled: boolean;
  onPick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-testid={testId}
      data-on={on ? 'true' : 'false'}
      className={on ? styles.source : `${styles.source} ${styles.sourceOff}`}
      disabled={disabled}
      onClick={onPick}
    >
      <span className={styles.sourceTop}>
        <span className={on ? styles.sourceIcon : `${styles.sourceIcon} ${styles.sourceIconOff}`}>
          <Icon name={icon} size={20} />
        </span>
        {on ? (
          <span className={styles.sourceRadio}>
            <Icon name="radio_button_checked" size={20} />
          </span>
        ) : null}
      </span>
      <span className={styles.sourceName}>{name}</span>
      <span className={styles.sourceSub}>{sub}</span>
    </button>
  );
}
