'use client';
// EZD-220 (03f:16 Existing-condition pins; W3; Q-0704 05-screens, 10-permissions; S03:146 Permission-denied; Q-0705
// boards waived, so it follows the inspector's card style; AC-EZD-220-1, -2, -4, -6; vault/build/assumptions.md
// EZD-220): the inspector for one selected pin. It shows the kind and the photo's thumbnail (a short-lived link signed
// from the file row). With Edit model the kind can change and a photo can be attached or replaced: a JPEG, PNG or
// HEIC file uploads as a source_file of kind photo and the pin takes its id once the upload is finished. Another type
// is refused with a message. A failed upload keeps the pin and shows Retry. Without Edit model it is read only.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { PIN_KINDS, type PinData, type PinKind } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import {
  checkPinPhoto,
  fetchPhotoLink,
  PinPhotoError,
  pinKindChange,
  pinPhotoChange,
  uploadPinPhoto,
} from './pin-photo';
import { pinUploadOf, type PinUploadState as Upload } from './pin-uploads';
import styles from './InspectorPanel.module.css';
import own from './PinPanel.module.css';
import { sameId } from '../shared/ids';

const kindKey = (kind: PinKind) => `office.pin.kind.${kind}` as MessageKey;

// The file chooser's filter; the extension decides the type (upload-files.ts).
const ACCEPT = '.jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic';

export type PinPanelProps = {
  store: ModelStore;
  pinId: string;
  canEdit: boolean;
  // Without a project id there is nowhere to send a photo, so Attach is not offered.
  projectId?: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
};

function useThumbnail(fileId: string | null, fetchImpl?: typeof fetch): string | null | 'loading' {
  const [link, setLink] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (fileId === null) return;
    let live = true;
    void fetchPhotoLink(fileId, fetchImpl ? { fetchImpl } : {}).then((url) => {
      if (live) setLink({ id: fileId, url });
    });
    return () => {
      live = false;
    };
  }, [fileId, fetchImpl]);
  if (fileId === null) return null;
  return link !== null && link.id === fileId ? link.url : 'loading';
}

export function PinPanel({
  store,
  pinId,
  canEdit,
  projectId,
  fetchImpl,
  retryDelaysMs,
}: PinPanelProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const value = [...objects.entries()].find(([k]) => sameId(k, pinId))?.[1];
  const data = value?.type === 'pin' ? (value.data as unknown as PinData) : null;
  const [upload, setUpload] = useState<Upload>(() => pinUploadOf(pinId).state);
  const input = useRef<HTMLInputElement>(null);
  const thumb = useThumbnail(data?.attributes.photoFileId ?? null, fetchImpl);
  // A photo the browser cannot draw (HEIC outside Safari) is still attached; a line says so.
  const [unshown, setUnshown] = useState<string | null>(null);

  if (data === null) return null;
  const mayAttach = canEdit && projectId !== undefined;

  const show = (s: Upload) => {
    pinUploadOf(pinId).state = s;
    setUpload(s);
  };

  const send = async () => {
    const p = pinUploadOf(pinId);
    if (p.file === null || projectId === undefined) return;
    show({ kind: 'uploading' });
    try {
      const fileId = await uploadPinPhoto(projectId, p.file, p.attempt, {
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(retryDelaysMs ? { retryDelaysMs } : {}),
      });
      const change = pinPhotoChange(store.getState().objects, pinId, fileId);
      if (change !== null) store.applyEdit([change]);
      p.attempt.current = null;
      p.file = null;
      show({ kind: 'idle' });
    } catch (e) {
      show({
        kind: 'failed',
        code: e instanceof PinPhotoError ? e.code : 'upload_failed',
      });
    }
  };

  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    const check = checkPinPhoto(file.name, file.size);
    if (!check.ok) {
      show({ kind: 'refused', reason: check.reason });
      return;
    }
    const p = pinUploadOf(pinId);
    p.file = { name: file.name, blob: file, contentType: check.contentType };
    p.attempt.current = null;
    void send();
  };

  const kind = data.attributes.kind;
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="pin">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title} data-testid="inspector-title">
            {t('office.pin.title', { kind: t(kindKey(kind)) })}
          </span>
          <span className={styles.subtitle} data-testid="inspector-subtitle">
            {t('office.inspector.status.existing')}
          </span>
        </div>
        {canEdit ? null : (
          <span className={styles.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      <div className={styles.section}>
        <label className={styles.field}>
          {t('office.pin.kind_label')}
          <select
            className={styles.select}
            data-testid="pin-kind"
            value={kind}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value as PinKind;
              if (!PIN_KINDS.includes(v)) return;
              const change = pinKindChange(store.getState().objects, pinId, v);
              if (change !== null) store.applyEdit([change]);
            }}
          >
            {PIN_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(kindKey(k))}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.section} data-testid="pin-photo">
        <span className={styles.field}>{t('office.pin.photo')}</span>
        {thumb === null ? (
          <p className={styles.hint} data-testid="pin-photo-none">
            {t('office.pin.no_photo')}
          </p>
        ) : thumb === 'loading' ? (
          <p className={styles.hint} data-testid="pin-photo-loading">
            {t('office.pin.photo_loading')}
          </p>
        ) : (
          // A signed Storage link, not a Next image route.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={thumb}
            className={own.thumb}
            onError={() => setUnshown(thumb)}
            hidden={unshown === thumb}
            src={thumb}
            alt={t('office.pin.photo_alt', { kind: t(kindKey(kind)) })}
            data-testid="pin-photo-thumb"
          />
        )}
        {typeof thumb === 'string' && unshown === thumb ? (
          <p className={styles.hint} data-testid="pin-photo-unshown">
            {t('office.pin.photo_unshown')}
          </p>
        ) : null}
        {upload.kind === 'uploading' ? (
          <p className={styles.hint} data-testid="pin-photo-uploading">
            {t('office.pin.uploading')}
          </p>
        ) : null}
        {upload.kind === 'failed' ? (
          <div className={own.failed} data-testid="pin-photo-failed" role="alert">
            <span>
              {t(
                upload.code === 'not_authorized'
                  ? 'error.not_authorized'
                  : 'office.pin.upload_failed',
              )}
            </span>
            {mayAttach && upload.code === 'upload_failed' ? (
              <button
                type="button"
                className={own.button}
                data-testid="pin-photo-retry"
                onClick={() => void send()}
              >
                {t('office.pin.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {upload.kind === 'refused' ? (
          <p className={own.error} data-testid="pin-photo-refused" role="alert">
            {t(
              upload.reason === 'not_photo'
                ? 'office.pin.not_photo'
                : upload.reason === 'too_large'
                  ? 'office.pin.too_large'
                  : 'office.pin.empty',
            )}
          </p>
        ) : null}
        {mayAttach ? (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              hidden
              data-testid="pin-photo-input"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={own.button}
              data-testid="pin-photo-attach"
              disabled={upload.kind === 'uploading'}
              onClick={() => input.current?.click()}
            >
              <Icon name="add_photo_alternate" size={16} />
              {t(data.attributes.photoFileId === null ? 'office.pin.attach' : 'office.pin.replace')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
