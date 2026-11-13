'use client';

// EZD-221b Build step 8 (vault/plans/EZD-221b.md Decided "Step 2 columns", "Template block load"; board
// S01bWizard.dc.html:101-185; S01 Template picker; Q-0396; Q-0398; Q-0399; Q-0401; Q-0214): New project step 2.
// Column 1 recaps step 1 with Edit, column 2 shows the Blank (template) source and the template picker (a lazy
// module, app/src/lazy/template-picker/, loaded here with its own loading and Retry states), column 3 the
// units and what Create will do.
// EZD-129 (boards S01bForeman, S01bForemanStates; Q-0202): column 3 holds the optional Foreman picker, and
// Create will lists "Add it to <name>'s listed projects" when the picked person's access is Listed.
import { useEffect, useState, type ReactElement } from 'react';
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
            disabled={busy}
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
        <div className={styles.sourceGrid}>
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
        </div>
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
          <span className={styles.createWillRow}>
            <Icon name="check" size={16} />
            {templateKey !== null
              ? t('office.new_project.create_will_open', {
                  template: t(`office.new_project.template_${templateKey}`),
                })
              : t('office.new_project.create_will_open_empty')}
          </span>
        </div>
      </div>
    </div>
  );
}
