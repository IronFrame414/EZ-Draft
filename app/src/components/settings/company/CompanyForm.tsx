'use client';

// EZD-112 Step 16 (vault/plans/EZD-112.md Decided "Form layout", "Identity order", "Contact order", "Form
// state", "Draft restore", "Unsaved line", "Buttons", "Save action", "Unsaved prompt", "Logo flow", "Logo
// shown", "Offline", "Status bar"; S15a; B15a): the Company settings form. A chosen logo, and Remove, are
// staged and stored only by Save. Logos are shown only as `<img src>` of a signed link (Q-0232).
import { useRouter } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  LOGO_CONTENT_TYPES,
  checkLogoFile,
  logoKindFromName,
  recheckDraftLogo,
  type CompanyData,
  type CompanyDraft,
  type CompanyLogo,
  type LogoChange,
} from '../../../lib/company/company';
import type { CustomerCounts } from '../../../lib/customers/customers';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import { uploadFile, type SignedUpload } from '../../../lib/storage/upload';
import type { MessageKey } from '../../../server/messages/catalog';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { OfflineBanner } from '../../states/OfflineBanner';
import { StateButton } from '../../states/StateButton';
import { useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { GuardedLink, useSettingsDraft, useUnsavedChanges } from '../unsaved-changes';
import styles from './CompanyForm.module.css';
import offline from './offline-input.module.css';
import { CustomersPanel } from './CustomersPanel';

type Fields = CompanyDraft['fields'];
type Staged = CompanyLogo & { fileName: string; size: number };
type FieldErrors = { name?: MessageKey; email?: MessageKey };

const KEEP: LogoChange = { action: 'keep' };
const UPLOAD_FAILED: MessageKey = 'office.company.logo_upload_failed';

function fieldsOf(company: CompanyData): Fields {
  return {
    name: company.name,
    licenseNo: company.licenseNo ?? '',
    phone: company.contact.phone ?? '',
    email: company.contact.email ?? '',
    website: company.contact.website ?? '',
    address: company.contact.address ?? '',
  };
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function messageKeyOf(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  const key = (body as { error?: { message_key?: unknown } } | null)?.error?.message_key;
  return typeof key === 'string' ? key : null;
}

export function CompanyForm({ initial }: { initial: CompanyData }) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const ids = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saved, setSaved] = useState<CompanyData>(initial);
  const [fields, setFields] = useState<Fields>(() => fieldsOf(initial));
  const [logoChange, setLogoChange] = useState<LogoChange>(KEEP);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveFailed, setSaveFailed] = useState(false);
  const [customerCounts, setCustomerCounts] = useState<CustomerCounts | null>(null);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);

  const savedFields = useMemo(() => fieldsOf(saved), [saved]);
  const changedName = fields.name !== savedFields.name;
  const changedLogo = logoChange.action !== 'keep';
  const changedLicense = fields.licenseNo !== savedFields.licenseNo;
  const changedPhone = fields.phone !== savedFields.phone;
  const changedEmail = fields.email !== savedFields.email;
  const changedWebsite = fields.website !== savedFields.website;
  const changedAddress = fields.address !== savedFields.address;
  const dirty =
    changedName ||
    changedLogo ||
    changedLicense ||
    changedPhone ||
    changedEmail ||
    changedWebsite ||
    changedAddress;

  const draft = useMemo<CompanyDraft | null>(
    () =>
      dirty
        ? {
            fields,
            logo: logoChange,
            staged: staged && {
              path: staged.path,
              kind: staged.kind,
              fileName: staged.fileName,
              size: staged.size,
            },
          }
        : null,
    [dirty, fields, logoChange, staged],
  );

  const restore = useCallback((d: CompanyDraft) => {
    setFields(d.fields);
    setLogoChange(d.logo);
    setStaged(null);
    setLogoError(null);
    if (d.logo.action !== 'set') return;
    setWorking(true);
    void recheckDraftLogo(d, (path) => postJson('/api/settings/company/logo/check', { path })).then(
      (r) => {
        setLogoChange(r.logoChange);
        setStaged(r.staged);
        setLogoError(r.logoError);
        setWorking(false);
      },
    );
  }, []);

  useSettingsDraft<CompanyDraft>('company', draft, restore);

  const save = useCallback(async (): Promise<boolean> => {
    if (fields.name.trim() === '') {
      setFieldErrors({ name: 'error.company_name_required' });
      return false;
    }
    setSaving(true);
    setSaveFailed(false);
    setFieldErrors({});
    try {
      const res = await fetch('/api/settings/company', {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: fields.name,
          licenseNo: fields.licenseNo,
          contact: {
            phone: fields.phone,
            email: fields.email,
            website: fields.website,
            address: fields.address,
          },
          logo: logoChange,
        }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { company: CompanyData };
        setSaved(body.company);
        setFields(fieldsOf(body.company));
        setLogoChange(KEEP);
        setStaged(null);
        setLogoError(null);
        router.refresh();
        return true;
      }
      if (res.status === 400) {
        const key = await messageKeyOf(res);
        if (key === 'error.company_name_required') {
          setFieldErrors({ name: 'error.company_name_required' });
          return false;
        }
        if (key === 'error.invalid_email') {
          setFieldErrors({ email: 'error.invalid_email' });
          return false;
        }
      }
      setSaveFailed(true);
      return false;
    } catch {
      setSaveFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }, [fields, logoChange, router]);

  useUnsavedChanges(dirty, save);

  const discard = () => {
    setFields(savedFields);
    setLogoChange(KEEP);
    setStaged(null);
    setLogoError(null);
    setFieldErrors({});
    setSaveFailed(false);
  };

  const statusItems = useMemo<readonly SettingsStatusEntry[]>(() => {
    const items: SettingsStatusEntry[] = [];
    if (saved.licenseNo) {
      items.push({ id: 'license', label: 'office.company.status_license', value: saved.licenseNo });
    }
    if (customerCounts !== null) {
      items.push({
        id: 'customers',
        label: 'office.customers.status',
        value: String(customerCounts.active),
      });
    }
    return items;
  }, [saved.licenseNo, customerCounts]);
  useSettingsStatus(statusItems);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    setLogoError(null);
    const problem = checkLogoFile(file);
    const kind = logoKindFromName(file.name);
    if (problem || kind === null) {
      setLogoError(`error.${problem ?? 'logo_wrong_type'}`);
      return;
    }
    setWorking(true);
    try {
      const res = await postJson('/api/settings/company/logo', {
        fileName: file.name,
        size: file.size,
      });
      if (res.status === 400) {
        setLogoError((await messageKeyOf(res)) ?? UPLOAD_FAILED);
        return;
      }
      if (res.status !== 200) {
        setLogoError(UPLOAD_FAILED);
        return;
      }
      const { upload } = (await res.json()) as { upload: SignedUpload };
      try {
        await uploadFile(upload, file, { contentType: LOGO_CONTENT_TYPES[kind] });
      } catch {
        setLogoError(UPLOAD_FAILED);
        return;
      }
      const checked = await postJson('/api/settings/company/logo/check', { path: upload.path });
      if (checked.status === 400) {
        setLogoError((await messageKeyOf(checked)) ?? UPLOAD_FAILED);
        return;
      }
      if (checked.status !== 200) {
        setLogoError(UPLOAD_FAILED);
        return;
      }
      const { logo } = (await checked.json()) as { logo: CompanyLogo };
      setStaged({ ...logo, fileName: file.name, size: file.size });
      setLogoChange({ action: 'set', path: logo.path });
    } catch {
      setLogoError(UPLOAD_FAILED);
    } finally {
      setWorking(false);
    }
  };

  const shownLogo: CompanyLogo | null =
    staged ?? (logoChange.action === 'remove' ? null : saved.logo);
  const errorText = (key: string) => (t.has(key) ? t(key) : t(UPLOAD_FAILED));

  const changedLabels: MessageKey[] = [];
  if (changedName) changedLabels.push('office.company.name');
  if (changedLogo) changedLabels.push('office.company.logo');
  if (changedLicense) changedLabels.push('office.company.license');
  if (changedPhone) changedLabels.push('office.company.phone');
  if (changedEmail) changedLabels.push('office.company.email');
  if (changedWebsite) changedLabels.push('office.company.website');
  if (changedAddress) changedLabels.push('office.company.address');

  const buttonsOff = !dirty || saving || !online || working;
  const readOnly = !online;
  // EZD-242 (Q-0360 (c)): offline inputs show the sunken, muted look.
  const inputClass = readOnly ? `${styles.input} ${offline.offline}` : styles.input;
  const set = (key: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFields((f) => ({ ...f, [key]: value }));
  };

  const fieldError = (field: 'name' | 'email' | 'logo', key: string) => (
    <div
      data-testid="company-field-error"
      data-field={field}
      role="alert"
      className={styles.fieldError}
    >
      {errorText(key)}
    </div>
  );

  return (
    <div data-testid="company-form" className={styles.form}>
      <div className={styles.grid}>
        <div className={styles.left}>
          {online ? null : (
            <div data-testid="company-offline">
              <OfflineBanner message="office.company.offline" />
            </div>
          )}
          {saveFailed ? (
            <div data-testid="company-save-error">
              <InlineError message="office.company.save_failed" onRetry={() => void save()} />
            </div>
          ) : null}
          <section className={styles.sec}>
            <h2>
              <Icon name="badge" size={17} />
              {t('office.company.identity')}
            </h2>
            <div className={styles.field}>
              <label htmlFor={`${ids}-name`}>{t('office.company.name')}</label>
              <input
                id={`${ids}-name`}
                data-testid="company-name"
                className={inputClass}
                aria-required="true"
                value={fields.name}
                readOnly={readOnly}
                onChange={set('name')}
              />
              {fieldErrors.name ? fieldError('name', fieldErrors.name) : null}
            </div>
            <div className={styles.field}>
              <span>{t('office.company.logo')}</span>
              <div className={styles.logoRow}>
                <div className={styles.logoBox}>
                  {shownLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage link (Q-0232)
                    <img
                      data-testid="company-logo-preview"
                      src={shownLogo.url}
                      alt={t('office.company.logo_alt')}
                    />
                  ) : null}
                </div>
                <div className={styles.logoMeta}>
                  {staged ? (
                    <span data-testid="company-logo-meta">
                      {`${staged.fileName} · `}
                      <span className={styles.mono}>
                        {t('office.company.logo_size', { kb: Math.ceil(staged.size / 1000) })}
                      </span>
                    </span>
                  ) : shownLogo ? (
                    <span data-testid="company-logo-meta">
                      {t('office.company.logo_saved', { kind: shownLogo.kind.toUpperCase() })}
                    </span>
                  ) : null}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      data-testid="company-logo-input"
                      accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                      onChange={(e) => void onPick(e)}
                    />
                    <StateButton
                      compact
                      className={styles.plainButton}
                      data-testid="company-logo-pick"
                      disabled={!online || working}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="upload" size={16} />
                      {working
                        ? t('office.company.logo_uploading')
                        : shownLogo
                          ? t('office.company.logo_replace')
                          : t('office.company.logo_upload')}
                    </StateButton>
                    {shownLogo ? (
                      <StateButton
                        compact
                        className={styles.plainButton}
                        data-testid="company-logo-remove"
                        disabled={!online || working}
                        onClick={() => {
                          setLogoChange({ action: 'remove' });
                          setStaged(null);
                          setLogoError(null);
                        }}
                      >
                        {t('office.company.logo_remove')}
                      </StateButton>
                    ) : null}
                  </div>
                  <span className={styles.hint}>{t('office.company.logo_hint')}</span>
                </div>
              </div>
              {logoError ? fieldError('logo', logoError) : null}
            </div>
            <div className={styles.field}>
              <label htmlFor={`${ids}-license`}>{t('office.company.license')}</label>
              <input
                id={`${ids}-license`}
                data-testid="company-license"
                className={`${inputClass} ${styles.mono}`}
                value={fields.licenseNo}
                readOnly={readOnly}
                onChange={set('licenseNo')}
              />
            </div>
            <p className={styles.note}>
              <Icon name="history" size={16} />
              <span>{t('office.company.sends_note')}</span>
            </p>
          </section>
          <hr className={styles.rule} />
          <section className={styles.sec}>
            <h2>
              <Icon name="contact_mail" size={17} />
              {t('office.company.contact')}
            </h2>
            <div className={styles.contact}>
              <div className={styles.field}>
                <label htmlFor={`${ids}-phone`}>{t('office.company.phone')}</label>
                <input
                  id={`${ids}-phone`}
                  data-testid="company-phone"
                  className={`${inputClass} ${styles.mono}`}
                  value={fields.phone}
                  readOnly={readOnly}
                  onChange={set('phone')}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor={`${ids}-email`}>{t('office.company.email')}</label>
                <input
                  id={`${ids}-email`}
                  data-testid="company-email"
                  className={inputClass}
                  value={fields.email}
                  readOnly={readOnly}
                  onChange={set('email')}
                />
                {fieldErrors.email ? fieldError('email', fieldErrors.email) : null}
              </div>
              <div className={`${styles.field} ${styles.wide}`}>
                <label htmlFor={`${ids}-website`}>{t('office.company.website')}</label>
                <input
                  id={`${ids}-website`}
                  data-testid="company-website"
                  className={inputClass}
                  value={fields.website}
                  readOnly={readOnly}
                  onChange={set('website')}
                />
              </div>
              <div className={`${styles.field} ${styles.wide}`}>
                <label htmlFor={`${ids}-address`}>{t('office.company.address')}</label>
                <input
                  id={`${ids}-address`}
                  data-testid="company-address"
                  className={inputClass}
                  value={fields.address}
                  readOnly={readOnly}
                  onChange={set('address')}
                />
              </div>
            </div>
            <p className={styles.hint}>
              {t('office.company.title_block_hint')}{' '}
              <GuardedLink href="/settings/title-block">
                {t('office.company.title_block_link')}
              </GuardedLink>
            </p>
          </section>
        </div>
        <div data-testid="company-customers" className={styles.right}>
          <CustomersPanel onCounts={setCustomerCounts} />
        </div>
      </div>
      <div className={styles.footer}>
        {dirty ? (
          <span data-testid="company-unsaved" className={styles.unsaved}>
            <span aria-hidden="true" className={styles.dot} />
            {t('office.company.unsaved', {
              count: changedLabels.length,
              fields: changedLabels.map((k) => t(k)).join(', '),
            })}
          </span>
        ) : null}
        <span className={styles.spacer} />
        <StateButton
          className={styles.plainButton}
          data-testid="company-discard"
          disabled={buttonsOff}
          onClick={discard}
        >
          {t('office.company.discard')}
        </StateButton>
        <StateButton
          variant="primary"
          className={styles.saveButton}
          data-testid="company-save"
          disabled={buttonsOff}
          onClick={() => void save()}
        >
          {t('office.company.save')}
        </StateButton>
      </div>
    </div>
  );
}

export function CompanyLoadError() {
  const router = useRouter();
  return (
    <div data-testid="company-load-error">
      <InlineError message="office.company.load_failed" onRetry={() => router.refresh()} />
    </div>
  );
}
