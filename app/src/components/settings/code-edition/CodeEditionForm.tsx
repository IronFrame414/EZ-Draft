'use client';

// EZD-613 (S15g; board S15gCode; Q-0210; Q-0220; ARCH Settings shell and Unsaved edits page contracts): the
// Settings > Code edition page body. Three cards as on the board: the default edition for new projects (v1: FBC
// 9th ed. with NEC 2023 only), the available rule sets and the electrical defaults (the optional load-calc method
// switch). Save in the header writes both; existing projects keep their own edition. The rule list, Mark verified
// and the rule counts are EZD-1710 (assumptions EZD-613). Offline: read-only. EZD-643 (Q-0220; Q-0765; board
// S15gCode): the select also offers FBC 8th ed. with NEC 2020 and "By permit date (automatic)", which shows the
// board's two lines (from 12/31/26 the 9th Edition, before it the 8th).
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import {
  BY_PERMIT_DATE,
  companyEditionLabel,
  editionLabel,
  isCompanyEditionDefault,
  type CompanyEditionDefault,
  type CodeEditionPatch,
  type CodeEditionSettings,
} from '../../../lib/code-edition/editions';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import { useOnline } from '../../../lib/network';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { useUnsavedChanges } from '../unsaved-changes';
import styles from './CodeEditionForm.module.css';

type Form = { edition: CompanyEditionDefault; optionalLoadCalc: boolean };

// The PATCH body for what changed; null when nothing did.
export function changesOf(saved: CodeEditionSettings, form: Form): CodeEditionPatch | null {
  const patch: CodeEditionPatch = {};
  if (form.edition !== saved.edition) patch.edition = form.edition;
  if (form.optionalLoadCalc !== saved.optionalLoadCalc) patch.optionalLoadCalc = form.optionalLoadCalc;
  return Object.keys(patch).length > 0 ? patch : null;
}

// EZD-643 (board S15gCode footer): the status bar's Default value. By permit date reads "By permit date" there;
// "(automatic)" is only in the select.
export function statusDefaultLabel(e: CompanyEditionDefault): MessageKey {
  return e === BY_PERMIT_DATE ? 'office.code_edition.status_by_permit_date' : companyEditionLabel(e);
}

export function CodeEditionPage({
  initial,
  fetchImpl,
}: {
  initial: CodeEditionSettings;
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const [saved, setSaved] = useState<CodeEditionSettings>(initial);
  const [form, setForm] = useState<Form>({
    edition: initial.edition,
    optionalLoadCalc: initial.optionalLoadCalc,
  });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const changes = changesOf(saved, form);
  const dirty = changes !== null;
  const readOnly = !online;

  const save = useCallback(async (): Promise<boolean> => {
    if (changes === null) return true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await (fetchImpl ?? fetch)('/api/settings/code-edition', {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (res.status === 200) {
        const body = (await res.json()) as CodeEditionSettings;
        setSaved(body);
        setForm({ edition: body.edition, optionalLoadCalc: body.optionalLoadCalc });
        router.refresh();
        return true;
      }
      setSaveFailed(true);
      return false;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, [changes, fetchImpl, router]);

  useUnsavedChanges(dirty, save);

  const statusItems = useMemo<readonly SettingsStatusEntry[]>(
    () => [
      {
        id: 'default',
        label: 'office.code_edition.status_default',
        value: t(statusDefaultLabel(saved.edition)),
      },
    ],
    [t, saved.edition],
  );
  useSettingsStatus(statusItems);

  const saveButton = (
    <StateButton
      variant="primary"
      className={styles.saveButton}
      data-testid="code-edition-save"
      disabled={readOnly || saving || !dirty}
      onClick={() => void save()}
    >
      {t('office.code_edition.save')}
    </StateButton>
  );

  return (
    <SettingsMain
      section="code_edition"
      title="office.settings.section.code_edition"
      subtitle="office.code_edition.subtitle"
      actions={saveButton}
      flush
    >
      <div data-testid="code-edition-form" className={styles.form}>
        {online ? null : (
          <div data-testid="code-edition-offline">
            <OfflineBanner message="office.code_edition.offline" />
          </div>
        )}
        {saveFailed ? (
          <div data-testid="code-edition-save-error">
            <InlineError message="office.code_edition.save_failed" onRetry={() => void save()} />
          </div>
        ) : null}
        <div className={styles.cards}>
          <section className={styles.box}>
            <h2 className={styles.boxTitle} id="code-edition-default-title">
              {t('office.code_edition.default_title')}
            </h2>
            <select
              data-testid="code-edition-default"
              aria-labelledby="code-edition-default-title"
              className={styles.select}
              disabled={readOnly}
              value={form.edition}
              onChange={(e) => {
                const v = e.target.value;
                if (isCompanyEditionDefault(v)) setForm((f) => ({ ...f, edition: v }));
              }}
            >
              {([BY_PERMIT_DATE, ...saved.available] as CompanyEditionDefault[]).map((e) => (
                <option key={e} value={e}>
                  {t(companyEditionLabel(e))}
                </option>
              ))}
            </select>
            {form.edition === BY_PERMIT_DATE ? (
              <dl className={styles.byDate} data-testid="code-edition-by-date">
                <div className={styles.byDateRow}>
                  <dt>{t('office.code_edition.by_date_from')}</dt>
                  <dd>{t(editionLabel('fbc9_nec2023'))}</dd>
                </div>
                <div className={styles.byDateRow}>
                  <dt>{t('office.code_edition.by_date_before')}</dt>
                  <dd>{t(editionLabel('fbc8_nec2020'))}</dd>
                </div>
              </dl>
            ) : null}
          </section>
          <section className={styles.box}>
            <h2 className={styles.boxTitle}>{t('office.code_edition.rule_sets_title')}</h2>
            <ul className={styles.ruleSets} data-testid="code-edition-rule-sets">
              {saved.available.map((e) => (
                <li key={e} className={styles.ruleSet} data-edition={e}>
                  <Icon name="check_circle" size={18} />
                  {t(editionLabel(e))}
                </li>
              ))}
            </ul>
            <p className={styles.note}>{t('office.code_edition.rule_sets_note')}</p>
          </section>
          <section className={styles.box}>
            <h2 className={styles.boxTitle}>{t('office.code_edition.electrical_title')}</h2>
            <div className={styles.switchRow}>
              <span className={styles.switchText} id="code-edition-optional-title">
                {t('office.code_edition.optional_title')}
                <span className={styles.switchHint}>{t('office.code_edition.optional_hint')}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.optionalLoadCalc}
                aria-labelledby="code-edition-optional-title"
                data-testid="code-edition-optional-load-calc"
                className={styles.switch}
                disabled={readOnly}
                onClick={() => setForm((f) => ({ ...f, optionalLoadCalc: !f.optionalLoadCalc }))}
              />
            </div>
            <p className={`${styles.note} ${styles.info}`}>
              <Icon name="info" size={14} />
              {t('office.code_edition.project_note')}
            </p>
          </section>
        </div>
      </div>
    </SettingsMain>
  );
}

export function CodeEditionLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="code_edition" title="office.settings.section.code_edition">
      <div data-testid="code-edition-load-error">
        <InlineError message="office.code_edition.load_failed" onRetry={() => router.refresh()} />
      </div>
    </SettingsMain>
  );
}
