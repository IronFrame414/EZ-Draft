'use client';
// EZD-5603b Build step 14 (vault/plans/EZD-5603b.md section 3 V1-V3; Decided "One photo", "File input", "Size text",
// "Remove photo hit area"; board S03cAIAssistantPhoto.dc.html lines 174, 190-200; approved wording A1-A5): the
// Assistant panel's photo parts. The picked file goes to the session; nothing here reads or keeps it.
import { useRef } from 'react';
import { Icon } from '../../components/icon/Icon';
import { PHOTO_ACCEPT, formatPhotoMb, type PhotoProblem } from '../../lib/assistant/photo-rules';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { AssistantPhotoUi } from './assistant-ui';
import styles from './AssistantPhoto.module.css';

const PROBLEM_KEYS: Readonly<Record<PhotoProblem, MessageKey>> = {
  type: 'office.assistant.photo_wrong_type',
  size: 'office.assistant.photo_too_big',
  unreadable: 'office.assistant.photo_unreadable',
};

// V1
export function PhotoButton({ disabled, onPick }: { disabled: boolean; onPick(file: File): void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={PHOTO_ACCEPT}
        data-testid="assistant-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        className={`${styles.photoButton} ${touch.target}`}
        aria-label={t('office.assistant.photo_attach')}
        data-testid="assistant-photo"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <span className={styles.photoIcon}>
          <Icon name="add_photo_alternate" size={18} />
        </span>
        {t('office.assistant.photo')}
      </button>
    </>
  );
}

// V2
export function PhotoThumb({
  photo,
  preparing,
  removeDisabled,
  onRemove,
}: {
  photo: AssistantPhotoUi | null;
  preparing: boolean;
  removeDisabled: boolean;
  onRemove(): void;
}) {
  const t = useT();
  if (photo === null && !preparing) return null;
  return (
    <div className={styles.thumbRow} data-testid="assistant-photo-thumb">
      {photo !== null ? (
        <>
          <div className={styles.thumb}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the shrunk photo, made in the browser */}
            <img
              className={styles.thumbImage}
              src={photo.url}
              alt={t('office.assistant.photo_alt')}
              data-testid="assistant-photo-image"
            />
            <span className={styles.removePlace}>
              <button
                type="button"
                className={`${styles.remove} ${touch.hitArea}`}
                aria-label={t('office.assistant.photo_remove')}
                data-testid="assistant-photo-remove"
                disabled={removeDisabled}
                onClick={onRemove}
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          </div>
          <span className={styles.thumbText}>
            <span className={styles.thumbName} data-testid="assistant-photo-name">
              {photo.name}
            </span>
            <span className={styles.thumbSize} data-testid="assistant-photo-size">
              {t('office.assistant.photo_size', { size: formatPhotoMb(photo.bytes) })}
            </span>
          </span>
        </>
      ) : null}
      {preparing ? (
        <span role="status" className={styles.preparing} data-testid="assistant-photo-preparing">
          {t('office.assistant.photo_preparing')}
        </span>
      ) : null}
    </div>
  );
}

// V3
export function PhotoProblemBox({ problem }: { problem: PhotoProblem }) {
  const t = useT();
  return (
    <div role="alert" className={styles.problem} data-testid="assistant-photo-error">
      <span className={styles.problemIcon}>
        <Icon name="error" size={18} />
      </span>
      <span>{t(PROBLEM_KEYS[problem])}</span>
    </div>
  );
}

export function PhotoNote() {
  const t = useT();
  return (
    <span className={styles.note} data-testid="assistant-photo-note">
      <span className={styles.noteIcon}>
        <Icon name="info" size={15} />
      </span>
      <span>{t('office.assistant.photo_note')}</span>
    </span>
  );
}
