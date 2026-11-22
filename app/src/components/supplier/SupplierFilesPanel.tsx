'use client';

// EZD-914 (S12 Layout "Left panel: Supplier files list with Upload; source note"; Controls Upload, File row, Source
// note; States Empty, Error "DWG uploaded, prompt for DXF; proprietary 2020 file uploaded, prompt for DXF/DWG, 3D
// export and order report"; Decisions 1 "source_file.supplier_name and supplier_contact_email"; board S12RenderMarkup
// left panel; Q-0781 screens with no board follow the nearest board). The panel lists the project's supplier files
// (GET /api/projects/[id]/supplier-files) and uploads new ones: picked files are checked in the browser (a DWG or a
// 2020 file gets its prompt and is never sent), each gets a type the user can correct, and Upload files sends each
// original straight to Storage (EZD-132) with the supplier name and contact email typed above. Tag, link, read codes
// and the rendering card are later tickets (EZD-917 onward); a file row only becomes the active file here.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { Refusal, RefusalReason } from '../../lib/imports/upload-files';
import {
  pickSupplierFiles,
  SUPPLIER_UPLOAD_ACCEPT,
  supplierKindOptions,
  type SupplierStaged,
  type SupplierUploadKind,
} from '../../lib/imports/supplier-upload';
import type { SourceFileKind } from '../../lib/storage/source-file-kinds';
import { uploadFile, type SignedUpload } from '../../lib/storage/upload';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';
import { StateButton } from '../states/StateButton';
import styles from './SupplierFilesPanel.module.css';

export type SupplierFile = {
  id: string;
  kind: SourceFileKind;
  originalName: string;
  sizeBytes: number;
  supplierName: string | null;
  supplierContactEmail: string | null;
  uploadedAt: string;
};

export type SupplierFilesPanelProps = {
  projectId: string;
  // Upload references for this project (S12 Permissions "Upload: Upload references").
  canUpload: boolean;
  onOpen?: (file: SupplierFile) => void;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
};

type Staged = SupplierStaged<Blob>;

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'no_costs' }
  | { state: 'ready'; files: SupplierFile[] };

const REFUSAL_KEYS: Record<RefusalReason, MessageKey> = {
  dwg: 'office.upload.dwg_prompt',
  proprietary_2020: 'office.supplier.prompt_2020',
  unsupported: 'office.supplier.unsupported',
  too_large: 'office.upload.too_large',
  empty: 'office.upload.empty',
};

const KIND_KEYS: Partial<Record<SourceFileKind, MessageKey>> = {
  image: 'office.supplier.kind_image',
  supplier_pdf: 'office.supplier.kind_supplier_pdf',
  order_report: 'office.supplier.kind_order_report',
  dxf: 'office.supplier.kind_dxf',
};

const KIND_ICONS: Partial<Record<SourceFileKind, IconName>> = {
  image: 'photo_library',
  supplier_pdf: 'description',
  order_report: 'description',
  dxf: 'description',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sizeInMb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);

// The board's received date, "10/08/26".
export const receivedDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify(body),
});

export function SupplierFilesPanel({
  projectId,
  canUpload,
  onOpen,
  fetchImpl,
  retryDelaysMs,
}: SupplierFilesPanelProps): ReactElement {
  const t = useT();
  // Read at call time: the app wraps window.fetch after the first render (version-fetch.ts), so a fetch kept from
  // render would change and load the list twice.
  const send = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => (fetchImpl ?? window.fetch)(input, init),
    [fetchImpl],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [refused, setRefused] = useState<Refusal[]>([]);
  const [supplier, setSupplier] = useState('');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<MessageKey | null>(null);
  const [sending, setSending] = useState<{ index: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<{ key: MessageKey; name: string } | null>(null);
  const prefilled = useRef(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await send(`/api/projects/${projectId}/supplier-files`, {
        credentials: 'same-origin',
      });
      // A refusal's body is read too, so the request finishes (an unread body keeps it open).
      if (res.status !== 200) await res.text().catch(() => '');
      if (res.status === 403) return setLoad({ state: 'no_costs' });
      if (res.status !== 200) return setLoad({ state: 'failed' });
      const body = (await res.json()) as { files: SupplierFile[] };
      setLoad({ state: 'ready', files: body.files });
      // The supplier fields start from the newest file's supplier.
      const newest = body.files.find((f) => f.supplierName !== null);
      if (!prefilled.current && newest) {
        prefilled.current = true;
        setSupplier(newest.supplierName ?? '');
        setEmail(newest.supplierContactEmail ?? '');
      }
    } catch {
      setLoad({ state: 'failed' });
    }
  }, [send, projectId]);

  useEffect(() => {
    // State is set from a microtask, not in the effect body (react-hooks/set-state-in-effect; as BenchmarkPlan does).
    void Promise.resolve().then(fetchList);
  }, [fetchList]);

  const reload = async () => {
    setLoad({ state: 'loading' });
    await fetchList();
  };

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? [], (file) => ({ name: file.name, size: file.size, file }));
    const picked = pickSupplierFiles<Blob>(files, () => crypto.randomUUID());
    setRefused(picked.refused);
    setSendError(null);
    setStaged((s) => [...s, ...picked.staged]);
  };

  const uploadAll = async () => {
    const name = supplier.trim();
    const mail = email.trim();
    if (name === '') return setFieldError('office.supplier.name_required');
    if (mail !== '' && !EMAIL_RE.test(mail)) return setFieldError('office.supplier.email_invalid');
    setFieldError(null);
    setSendError(null);
    let left = staged;
    for (const [index, item] of staged.entries()) {
      setSending({ index: index + 1, total: staged.length });
      const failed = (key: MessageKey = 'office.upload.failed') => {
        setSendError({ key, name: item.name });
        setSending(null);
        setStaged(left);
      };
      try {
        const started = await send(
          `/api/projects/${projectId}/supplier-files`,
          json({
            kind: item.kind,
            originalName: item.name,
            contentType: item.contentType,
            size: item.size,
            supplierName: name,
            supplierContactEmail: mail === '' ? null : mail,
          }),
        );
        if (started.status !== 201) await started.text().catch(() => '');
        if (started.status === 403) return failed('office.upload.not_authorized');
        if (started.status !== 201) return failed();
        const body = (await started.json()) as {
          sourceFile: { id: string };
          upload: SignedUpload;
        };
        await uploadFile(body.upload, item.file, {
          contentType: item.contentType,
          fetchImpl: send,
          ...(retryDelaysMs !== undefined ? { retryDelaysMs } : {}),
        });
        const done = await send(`/api/supplier-files/${body.sourceFile.id}/complete`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        await done.text().catch(() => '');
        if (done.status !== 200) return failed();
      } catch {
        return failed();
      }
      left = left.filter((s) => s.id !== item.id);
    }
    setSending(null);
    setStaged([]);
    await reload();
  };

  const files = load.state === 'ready' ? load.files : [];
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? null;
  const noteFile = active?.supplierName ? active : (files.find((f) => f.supplierName) ?? null);

  return (
    <div className={styles.panel} data-testid="supplier-files-panel">
      <div className={styles.header}>
        <h2 className={styles.title}>{t('office.supplier.files_title')}</h2>
        {canUpload ? (
          <>
            <button
              type="button"
              data-testid="supplier-upload"
              className={`${styles.upload} ${touch.hitArea}`}
              disabled={sending !== null}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="upload" size={16} />
              {t('office.supplier.upload')}
            </button>
            <input
              ref={inputRef}
              data-testid="supplier-upload-input"
              className={styles.input}
              type="file"
              multiple
              accept={SUPPLIER_UPLOAD_ACCEPT}
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
      </div>

      <SupplierRefusals refused={refused} />

      {canUpload && staged.length > 0 ? (
        <section className={styles.staged} data-testid="supplier-staged">
          <h3 className={styles.subTitle}>{t('office.supplier.ready_title')}</h3>
          <label className={styles.field}>
            <span>{t('office.supplier.name_label')}</span>
            <input
              data-testid="supplier-name"
              className={styles.text}
              value={supplier}
              maxLength={255}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('office.supplier.email_label')}</span>
            <input
              data-testid="supplier-email"
              className={styles.text}
              type="email"
              value={email}
              maxLength={320}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {fieldError ? (
            <p className={styles.error} role="alert" data-testid="supplier-field-error">
              {t(fieldError)}
            </p>
          ) : null}
          <ul className={styles.stagedList}>
            {staged.map((item) => (
              <li key={item.id} className={styles.stagedRow} data-testid="supplier-staged-file">
                <span className={styles.name} title={item.name}>
                  {item.name}
                </span>
                <select
                  data-testid="supplier-staged-kind"
                  aria-label={t('office.supplier.tag_label', { name: item.name })}
                  className={styles.kind}
                  value={item.kind}
                  disabled={sending !== null}
                  onChange={(e) => {
                    const kind = e.target.value as SupplierUploadKind;
                    setStaged((s) => s.map((x) => (x.id === item.id ? { ...x, kind } : x)));
                  }}
                >
                  {supplierKindOptions(item.contentType).map((kind) => (
                    <option key={kind} value={kind}>
                      {t(KIND_KEYS[kind] as MessageKey)}
                    </option>
                  ))}
                </select>
                <StateButton
                  variant="icon"
                  aria-label={t('office.supplier.remove', { name: item.name })}
                  disabled={sending !== null}
                  onClick={() => setStaged((s) => s.filter((x) => x.id !== item.id))}
                >
                  <Icon name="close" size={18} />
                </StateButton>
              </li>
            ))}
          </ul>
          {sendError ? (
            <p className={styles.error} role="alert" data-testid="supplier-send-error">
              {t(sendError.key, { name: sendError.name })}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="supplier-send"
            className={`${styles.send} ${touch.hitArea}`}
            disabled={sending !== null}
            onClick={() => void uploadAll()}
          >
            {sending
              ? t('office.upload.uploading', { index: sending.index, total: sending.total })
              : t('office.supplier.send')}
          </button>
        </section>
      ) : null}

      {load.state === 'loading' ? (
        <div className={styles.loading} data-testid="supplier-files-loading" aria-busy="true" />
      ) : load.state === 'no_costs' ? (
        <p className={styles.muted} data-testid="supplier-files-no-costs">
          {t('office.supplier.no_costs')}
        </p>
      ) : load.state === 'failed' ? (
        <div className={styles.muted} role="alert" data-testid="supplier-files-failed">
          {t('office.supplier.load_failed')}{' '}
          <button type="button" className={styles.link} onClick={() => void reload()}>
            {t('office.supplier.retry')}
          </button>
        </div>
      ) : files.length === 0 ? (
        <p className={styles.muted} data-testid="supplier-files-empty">
          {t('office.supplier.empty')}
        </p>
      ) : (
        <ul className={styles.list} data-testid="supplier-files">
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                data-testid="supplier-file"
                data-kind={file.kind}
                aria-current={active?.id === file.id ? 'true' : undefined}
                className={active?.id === file.id ? `${styles.row} ${styles.rowActive}` : styles.row}
                onClick={() => {
                  setActiveId(file.id);
                  onOpen?.(file);
                }}
              >
                <span className={styles.rowIcon}>
                  <Icon name={KIND_ICONS[file.kind] ?? 'description'} size={18} />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName} title={file.originalName}>
                    {file.originalName}
                  </span>
                  <span className={styles.rowSummary} data-testid="supplier-file-summary">
                    {t('office.supplier.row_summary', {
                      type: t(KIND_KEYS[file.kind] ?? 'office.supplier.kind_supplier_pdf'),
                      size: sizeInMb(file.sizeBytes),
                    })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {noteFile?.supplierName ? (
        <p className={styles.note} data-testid="supplier-source-note">
          <Icon name="info" size={16} />
          <span>
            {t('office.supplier.source_note', {
              supplier: noteFile.supplierName,
              date: receivedDate(noteFile.uploadedAt),
            })}
          </span>
        </p>
      ) : null}
    </div>
  );
}

// The prompt for each refused file: a DWG asks for a DXF; a 2020 Design file asks for the DXF, a 3D export and the
// order report (S12 States Error).
export function SupplierRefusals({ refused }: { refused: readonly Refusal[] }): ReactElement | null {
  const t = useT();
  if (refused.length === 0) return null;
  return (
    <ul className={styles.refused} data-testid="supplier-refused" role="alert">
      {refused.map((r, i) => (
        <li key={`${r.name}-${i}`} className={styles.refusal} data-reason={r.reason}>
          <span className={styles.refusalName}>{r.name}</span>
          <span data-testid="supplier-refused-message">{t(REFUSAL_KEYS[r.reason])}</span>
        </li>
      ))}
    </ul>
  );
}
