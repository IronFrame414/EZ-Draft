'use client';

// EZD-301 (S01 Start from a file flow: File drop zone / Browse, DWG upload, File type tag per file, Remove file;
// board S01b column 2 note): drop files or browse, see each file with its auto-detected tag (the user can correct
// it) and Remove, and see why a file was refused. A DWG gets "Save this drawing as DXF and upload the DXF". Files
// stay in the browser until the caller sends them, so Remove needs no server call.
import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import {
  addFiles,
  kindOptions,
  removeFile,
  setKind,
  UPLOAD_ACCEPT,
  type RefusalReason,
  type UploadKind,
  type UploadList,
} from '../../lib/imports/upload-files';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import { StateButton } from '../states/StateButton';
import styles from './Upload.module.css';

export type UploadStepProps = {
  list: UploadList;
  onChange: (next: UploadList) => void;
  disabled?: boolean;
};

const REFUSAL_KEYS: Record<RefusalReason, MessageKey> = {
  dwg: 'office.upload.dwg_prompt',
  unsupported: 'office.upload.unsupported',
  too_large: 'office.upload.too_large',
  empty: 'office.upload.empty',
};

const kindLabel = (kind: UploadKind): MessageKey => `office.upload.kind_${kind}`;

const newId = () => crypto.randomUUID();

export const sizeInMb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);

export function filesOf(list: FileList | null): { name: string; size: number; file: File }[] {
  return Array.from(list ?? [], (file) => ({ name: file.name, size: file.size, file }));
}

export function UploadStep({ list, onChange, disabled = false }: UploadStepProps): ReactElement {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (files: FileList | null) => {
    if (disabled) return;
    onChange(addFiles(list, filesOf(files), newId));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setOver(true);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <div className={styles.step} data-testid="upload-step">
      <div
        data-testid="upload-drop-zone"
        className={over ? `${styles.zone} ${styles.zoneOver}` : styles.zone}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <span className={styles.zoneTitle}>
          <Icon name="upload" size={20} />
          {t('office.upload.drop_title')}
        </span>
        <span>{t('office.upload.drop_sub')}</span>
        <button
          type="button"
          data-testid="upload-browse"
          className={`${styles.browse} ${touch.hitArea}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {t('office.upload.browse')}
        </button>
        <input
          ref={inputRef}
          data-testid="upload-input"
          className={styles.input}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {list.refused.length > 0 ? (
        <ul className={styles.refused} data-testid="upload-refused" role="alert">
          {list.refused.map((r, i) => (
            <li key={`${r.name}-${i}`} className={styles.refusal} data-reason={r.reason}>
              <span className={styles.refusalName}>{r.name}</span>
              <span data-testid="upload-refused-message">{t(REFUSAL_KEYS[r.reason])}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {list.items.length === 0 ? (
        <p className={styles.empty} data-testid="upload-files-empty">
          {t('office.upload.files_empty')}
        </p>
      ) : (
        <ul className={styles.list} data-testid="upload-files">
          {list.items.map((item) => (
            <li
              key={item.id}
              className={styles.row}
              data-testid="upload-file"
              data-kind={item.kind}
            >
              <span className={styles.name}>
                <span className={styles.nameText} title={item.name} data-testid="upload-file-name">
                  {item.name}
                </span>
                <span className={styles.size}>
                  {t('office.upload.size_mb', { size: sizeInMb(item.size) })}
                </span>
              </span>
              <select
                data-testid="upload-file-tag"
                aria-label={t('office.upload.tag_label', { name: item.name })}
                className={styles.tag}
                value={item.kind}
                disabled={disabled}
                onChange={(e) => onChange(setKind(list, item.id, e.target.value as UploadKind))}
              >
                {kindOptions(item.contentType).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(kindLabel(kind))}
                  </option>
                ))}
              </select>
              <StateButton
                variant="icon"
                data-testid="upload-file-remove"
                aria-label={t('office.upload.remove', { name: item.name })}
                disabled={disabled}
                onClick={() => onChange(removeFile(list, item.id))}
              >
                <Icon name="close" size={18} />
              </StateButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
