'use client';

// EZD-709 (S15b; board S15bTitleBlock; R24 #7, #26; Q-0182; AC-EZD-709-1, AC-EZD-709-2; ARCH Settings shell and
// Unsaved edits page contracts): the Settings > Title block page body. Left: the six numbered parts of the fixed
// layout; only the company block has a switch (S15b Decision 1). The completeness box lists missing company
// fields (S15b Validation). Right: the live preview at 24x36 or 11x17 with sample project values; it re-renders
// from the form on every change, before Save. Offline: read-only.
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { editionLabel } from '../../../lib/code-edition/editions';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import {
  PREVIEW_SIZES,
  TITLE_BLOCK_COLUMN,
  companyLine,
  fieldLabel,
  missingCompanyFields,
  sheetsScreenHref,
  titleBlockPreview,
  titleBlockZoom,
  type PreviewSize,
  type TitleBlockConfig,
  type TitleBlockPreview,
  type TitleBlockSettings,
  type TitleBlockUsage,
} from '../../../lib/title-block/title-block';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { GuardedLink, useUnsavedChanges } from '../unsaved-changes';
import styles from './TitleBlockForm.module.css';

// The PATCH body for what changed; null when nothing did.
export function changesOf(saved: TitleBlockConfig, form: TitleBlockConfig): TitleBlockConfig | null {
  return form.showCompany === saved.showCompany ? null : { showCompany: form.showCompany };
}

function Item({
  n,
  title,
  badge,
  children,
}: {
  n: number;
  title: ReactNode;
  badge?: 'auto' | 'always';
  children: ReactNode;
}) {
  const t = useT();
  return (
    <li className={styles.item} data-title-block-item={n}>
      <span className={styles.num}>{n}</span>
      <div className={styles.itemBody}>
        <div className={styles.itemHead}>
          <span className={styles.itemTitle}>{title}</span>
          {badge === undefined ? null : (
            <span className={styles.badge}>
              <Icon name={badge === 'auto' ? 'autorenew' : 'lock'} size={14} />
              {t(badge === 'auto' ? 'office.title_block.auto_filled' : 'office.title_block.always_on')}
            </span>
          )}
        </div>
        <div className={styles.itemText}>{children}</div>
      </div>
    </li>
  );
}

function Marker({ n }: { n: number }) {
  return (
    <span className={styles.marker} aria-hidden="true">
      {n}
    </span>
  );
}

// EZD-1991 (S15b "Zoom to title block"): zoomed, the sheet is scaled and shifted (titleBlockZoom) so the title
// block column fills the preview's width; the page's viewport keeps the whole sheet's shape and scrolls down it.
export function TitleBlockPreviewView({
  preview,
  companyName,
  zoomed = false,
}: {
  preview: TitleBlockPreview;
  companyName: string;
  zoomed?: boolean;
}) {
  const t = useT();
  const { sheet } = preview;
  const zoom = titleBlockZoom(preview.size);
  const zoomStyle = { transform: `translateX(${zoom.shift * 100}%) scale(${zoom.scale})`, transformOrigin: '0 0' };
  return (
    <div
      data-testid="title-block-preview"
      data-size={preview.size}
      data-zoom={zoomed ? 'title_block' : 'sheet'}
      className={styles.sheet}
      style={{ aspectRatio: `${sheet.width} / ${sheet.height}`, ...(zoomed ? zoomStyle : {}) }}
    >
      <div className={styles.drawing}>
        <span className={styles.drawingLabel}>{t('office.title_block.preview_sheet')}</span>
      </div>
      <div
        data-testid="title-block-preview-column"
        className={`${styles.tb} ${preview.size === '11x17' ? styles.tbSmall : ''}`}
        style={{ width: `${TITLE_BLOCK_COLUMN[preview.size] * 100}%` }}
      >
        <section className={styles.tbCell} data-testid="title-block-preview-company">
          <Marker n={1} />
          {preview.company === null ? null : (
            <div data-testid="title-block-preview-company-block" className={styles.tbCompany}>
              {preview.company.logoUrl === null ? null : (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, as CompanyForm shows it
                <img className={styles.tbLogo} src={preview.company.logoUrl} alt={companyName} />
              )}
              <strong className={styles.tbName}>{preview.company.name}</strong>
              {preview.company.licenseNo === null ? null : (
                <span className={styles.tbSmallText}>
                  {t('office.title_block.tb.license')} {preview.company.licenseNo}
                </span>
              )}
              {preview.company.contact.map((c) => (
                <span key={c} className={styles.tbSmallText}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className={styles.tbCell}>
          <Marker n={2} />
          <span className={styles.tbLabel}>{t('office.title_block.tb.project')}</span>
          <strong className={styles.tbValue}>{t('office.title_block.sample.project_name')}</strong>
          <span className={styles.tbSmallText}>{t('office.title_block.sample.address')}</span>
          <span className={styles.tbSmallText}>
            {t('office.title_block.tb.owner')} {t('office.title_block.sample.owner')}
          </span>
          <span className={styles.tbSmallText}>
            {t('office.title_block.tb.parcel')} {t('office.title_block.sample.parcel')}
          </span>
          <span className={styles.tbSmallText}>
            {t('office.title_block.tb.code')}{' '}
            {preview.codeEdition === null
              ? t('office.title_block.tb.no_edition')
              : t(editionLabel(preview.codeEdition))}
          </span>
          <span className={styles.tbSmallText}>
            {t('office.title_block.tb.scope')} {t('office.title_block.sample.scope')}
          </span>
        </section>
        <section className={styles.tbCell} data-testid="title-block-preview-revisions">
          <Marker n={3} />
          <span className={styles.tbLabel}>{t('office.title_block.tb.revisions')}</span>
          <table className={styles.tbTable}>
            <thead>
              <tr>
                <th>{t('office.title_block.tb.rev_no')}</th>
                <th>{t('office.title_block.tb.rev_date')}</th>
                <th>{t('office.title_block.tb.rev_description')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.revisions.map((r) => (
                <tr key={`${r.kind}${r.number}`}>
                  <td>
                    {t(r.kind === 'version' ? 'office.title_block.tb.version_n' : 'office.title_block.tb.rev_n', {
                      n: r.number,
                    })}
                  </td>
                  <td>{r.date}</td>
                  <td>{t(r.description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={`${styles.tbCell} ${styles.tbBlanks}`}>
          <div className={styles.tbBlank} data-testid="title-block-preview-seal">
            <Marker n={4} />
            <span className={styles.tbLabel}>{t('office.title_block.tb.seal')}</span>
            <span className={styles.tbBlankBox}>{t('office.title_block.tb.seal_blank')}</span>
          </div>
          <div className={styles.tbBlank} data-testid="title-block-preview-stamp">
            <Marker n={5} />
            <span className={styles.tbLabel}>{t('office.title_block.tb.dept_approval')}</span>
            <span className={styles.tbBlankBox}>{t('office.title_block.tb.stamp_blank')}</span>
          </div>
        </section>
        <section className={`${styles.tbCell} ${styles.tbSheet}`}>
          <Marker n={6} />
          <span className={styles.tbSmallText}>
            {t('office.title_block.tb.drawn')} {t('office.title_block.sample.drawn')} ·{' '}
            {t('office.title_block.tb.date')} {t('office.title_block.sample.date')}
          </span>
          <span className={styles.tbLabel}>{t('office.title_block.tb.sheet_title')}</span>
          <strong className={styles.tbValue}>{t('office.title_block.sample.sheet_title')}</strong>
          <span className={styles.tbLabel}>{t('office.title_block.tb.sheet')}</span>
          <strong className={styles.tbSheetNo}>{t('office.title_block.sample.sheet_number')}</strong>
        </section>
      </div>
    </div>
  );
}

// EZD-1991 (Q-0813; S15b head): "Used on N sheets · Open Sheets", right of the title. Open Sheets opens the most
// recently changed project on its Sheets screen; with no project there is nothing to open and no link.
export function TitleBlockUsageLine({ usage }: { usage: TitleBlockUsage }) {
  const t = useT();
  return (
    <span className={styles.usage} data-testid="title-block-usage">
      <span data-testid="title-block-usage-count">
        {usage.sheets === 1
          ? t('office.title_block.used_on_one')
          : t('office.title_block.used_on', { n: usage.sheets })}
      </span>
      {usage.projectId === null ? null : (
        <>
          <span aria-hidden="true">·</span>
          <GuardedLink
            href={sheetsScreenHref(usage.projectId)}
            className={styles.link}
            data-testid="title-block-open-sheets"
          >
            {t('office.title_block.open_sheets')}
          </GuardedLink>
        </>
      )}
    </span>
  );
}

export function TitleBlockPage({
  initial,
  usage,
  fetchImpl,
}: {
  initial: TitleBlockSettings;
  // Absent when the count could not be read: the line is left out.
  usage?: TitleBlockUsage;
  fetchImpl?: typeof fetch;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const [saved, setSaved] = useState<TitleBlockConfig>(initial.config);
  const [form, setForm] = useState<TitleBlockConfig>(initial.config);
  const [size, setSize] = useState<PreviewSize>('24x36');
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const changes = changesOf(saved, form);
  const dirty = changes !== null;
  const readOnly = !online;
  const missing = missingCompanyFields(initial.company);
  const preview = titleBlockPreview(initial, form, size);

  const save = useCallback(async (): Promise<boolean> => {
    if (changes === null) return true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await (fetchImpl ?? fetch)('/api/settings/title-block', {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (res.status === 200) {
        const body = (await res.json()) as TitleBlockConfig;
        setSaved(body);
        setForm(body);
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
        id: 'title_block',
        label: 'office.title_block.status_title_block',
        value: t('office.title_block.status_title_block_value'),
      },
      {
        id: 'preview',
        label: 'office.title_block.status_preview',
        value: t(`office.title_block.status_preview_value.${size}`),
      },
      {
        id: 'company_fields',
        label: 'office.title_block.status_fields',
        value: t(
          missing.length === 0
            ? 'office.title_block.status_fields_complete'
            : 'office.title_block.status_fields_missing',
        ),
      },
    ],
    [t, size, missing.length],
  );
  useSettingsStatus(statusItems);

  return (
    <SettingsMain
      section="title_block"
      title="office.settings.section.title_block"
      subtitle="office.title_block.subtitle"
      flush
      {...(usage === undefined ? {} : { actions: <TitleBlockUsageLine usage={usage} /> })}
    >
      <div data-testid="title-block-form" className={styles.page}>
        <div className={styles.left}>
          {online ? null : (
            <div data-testid="title-block-offline">
              <OfflineBanner message="office.title_block.offline" />
            </div>
          )}
          {saveFailed ? (
            <div data-testid="title-block-save-error">
              <InlineError message="office.title_block.save_failed" onRetry={() => void save()} />
            </div>
          ) : null}
          <div className={styles.companyCard}>
            <span className={styles.num}>1</span>
            <div className={styles.itemBody}>
              <div className={styles.switchRow}>
                <span className={styles.itemTitle} id="title-block-show-company-title">
                  {t('office.title_block.company_title')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.showCompany}
                  aria-labelledby="title-block-show-company-title"
                  data-testid="title-block-show-company"
                  className={styles.switch}
                  disabled={readOnly}
                  onClick={() => setForm((f) => ({ showCompany: !f.showCompany }))}
                />
              </div>
              <p className={styles.itemText}>
                {companyLine(initial.company)}.{' '}
                <GuardedLink href="/settings/company" className={styles.link}>
                  {t('office.title_block.edit_in_company')}
                </GuardedLink>
              </p>
            </div>
          </div>
          <ol className={styles.items}>
            <Item n={2} title={t('office.title_block.project_title')} badge="auto">
              {t('office.title_block.field.project_address')}{' '}
              <span className={styles.chip}>{t('office.title_block.source_project')}</span> ·{' '}
              {t('office.title_block.parcel_and_owner')}{' '}
              <span className={styles.chip}>{t('office.title_block.source_appraiser')}</span> ·{' '}
              {t('office.title_block.field.code_edition')}{' '}
              <span className={styles.chip}>{t('office.title_block.source_project')}</span> ·{' '}
              {t('office.title_block.field.scope_of_work')}{' '}
              <span className={styles.chip}>{t('office.title_block.source_project')}</span>
            </Item>
            <Item n={3} title={t('office.title_block.revision_title')} badge="always">
              {t('office.title_block.revision_body')}
            </Item>
            <Item n={4} title={t('office.title_block.seal_title')} badge="always">
              {t('office.title_block.seal_body')}
            </Item>
            <Item n={5} title={t('office.title_block.stamp_title')} badge="always">
              {t('office.title_block.stamp_body')}{' '}
              <GuardedLink href="/settings/sheet-presets" className={styles.link}>
                {t('office.title_block.sheet_presets_link')}
              </GuardedLink>
            </Item>
            <Item n={6} title={t('office.title_block.sheet_title')} badge="auto">
              {t('office.title_block.sheet_body')}
            </Item>
          </ol>
          {missing.length === 0 ? (
            <p className={`${styles.check} ${styles.checkOk}`} data-testid="title-block-complete">
              <Icon name="check_circle" size={16} />
              <span>
                <strong>{t('office.title_block.complete_title')}</strong>{' '}
                {t('office.title_block.complete_body')}
              </span>
            </p>
          ) : (
            <div className={`${styles.check} ${styles.checkWarn}`} role="status" data-testid="title-block-missing">
              <Icon name="error" size={16} />
              <span>
                <strong>
                  {t('office.title_block.missing_title', {
                    fields: missing.map((f) => t(fieldLabel(f))).join(', '),
                  })}
                </strong>{' '}
                {t('office.title_block.missing_body')}{' '}
                <GuardedLink href="/settings/company" className={styles.link}>
                  {t('office.title_block.edit_in_company')}
                </GuardedLink>
                <ul className={styles.missingList}>
                  {missing.map((f) => (
                    <li key={f} data-missing-field={f}>
                      {t(fieldLabel(f))}
                    </li>
                  ))}
                </ul>
              </span>
            </div>
          )}
          <div className={styles.footer}>
            <span className={styles.footerText} data-testid="title-block-dirty">
              {t(dirty ? 'office.title_block.unsaved' : 'office.title_block.no_changes')}
            </span>
            <StateButton
              variant="primary"
              className={styles.saveButton}
              data-testid="title-block-save"
              disabled={readOnly || saving || !dirty}
              onClick={() => void save()}
            >
              {t('office.title_block.save')}
            </StateButton>
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.previewHead}>
            <span className={styles.previewLabel}>{t('office.title_block.preview_label')}</span>
            <div className={styles.segment} role="radiogroup" aria-label={t('office.title_block.preview_size')}>
              {PREVIEW_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  data-testid={`title-block-size-${s}`}
                  className={styles.segmentButton}
                  onClick={() => setSize(s)}
                >
                  {t(`office.title_block.size.${s}`)}
                </button>
              ))}
            </div>
            <span className={styles.sizeNote}>{t(`office.title_block.size_note.${size}`)}</span>
            <span className={styles.sampleNote}>{t('office.title_block.sample_caption')}</span>
            <StateButton
              compact
              className={styles.zoomButton}
              data-testid="title-block-zoom"
              aria-pressed={zoomed}
              onClick={() => setZoomed((z) => !z)}
            >
              <Icon name="search" size={16} />
              {t('office.title_block.zoom')}
            </StateButton>
          </div>
          <div className={styles.previewFrame}>
            {/* EZD-1991: the preview's window; zoomed, it keeps the whole sheet's shape and scrolls. */}
            <div
              data-testid="title-block-viewport"
              data-zoom={zoomed ? 'title_block' : 'sheet'}
              className={`${styles.viewport} ${zoomed ? styles.viewportZoomed : ''}`}
              style={zoomed ? { aspectRatio: `${preview.sheet.width} / ${preview.sheet.height}` } : undefined}
            >
              <TitleBlockPreviewView preview={preview} companyName={initial.company.name} zoomed={zoomed} />
            </div>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendBlank} aria-hidden="true" />
              {t('office.title_block.legend_blank')}
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} aria-hidden="true" />
              {t('office.title_block.legend_numbers')}
            </span>
            <span className={styles.legendNote}>{t('office.title_block.legend_11x17')}</span>
          </div>
        </div>
      </div>
    </SettingsMain>
  );
}

export function TitleBlockLoadError() {
  const router = useRouter();
  return (
    <SettingsMain section="title_block" title="office.settings.section.title_block">
      <div data-testid="title-block-load-error">
        <InlineError message="office.title_block.load_failed" onRetry={() => router.refresh()} />
      </div>
    </SettingsMain>
  );
}
