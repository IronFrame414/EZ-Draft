'use client';
// EZD-215 (Q-0205; 09-calculations Q-0704, Q-0708; phase-02.md:33; S03:146 Permission-denied, S03:154; Q-0705 boards
// waived, so it follows the inspector's card style; AC-EZD-215-4, -6; vault/build/assumptions.md EZD-215): the
// inspector for one selected engineer note. "Engineer required" shows until "Engineer letter on file" is ticked. With
// Edit model the form takes the engineer name and what was approved (both required to save), an optional PDF or image
// letter sent as a source_file of kind engineer_letter (EZD-132 upload, as a pin photo), and the tick, which is
// offered only when both texts are filled. Without Edit model the form is not offered; the warning still shows.
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  canMarkLetterOnFile,
  CURRENT_SCHEMA_VERSION,
  engineerRequired,
  parseStoredObject,
  type EngineerNoteData,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { checkFile, kindTakes } from '../../lib/imports/upload-files';
import { useT } from '../../lib/messages';
import type { SourceContentType } from '../../lib/storage/source-file-kinds';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { Change, Objects } from '../model/patches';
import { PinPhotoError, uploadPinPhoto, type PhotoAttempt } from './pin-photo';
import styles from './InspectorPanel.module.css';

// The file chooser's filter; the extension decides the type (upload-files.ts).
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic';

type Attrs = EngineerNoteData['attributes'];
export type NoteDraft = Pick<Attrs, 'engineerName' | 'approvedText' | 'letterOnFile'>;
export type NoteRefusal = 'not_found' | 'name_required' | 'approved_required';

export const NOTE_REFUSALS: Readonly<Record<Exclude<NoteRefusal, 'not_found'>, MessageKey>> = {
  name_required: 'office.engineer.name_required',
  approved_required: 'office.engineer.approved_required',
};

function noteOf(objects: Objects, noteId: string): { key: string; data: EngineerNoteData } | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === noteId.toLowerCase());
  const v = key === undefined ? undefined : objects.get(key);
  if (key === undefined || v === undefined || v.type !== 'engineer_note') return null;
  return { key, data: v.data as unknown as EngineerNoteData };
}

function change(key: string, data: EngineerNoteData, set: Partial<Attrs>): Change | null {
  const parsed = parseStoredObject({
    id: key,
    type: 'engineer_note',
    schema_version: CURRENT_SCHEMA_VERSION,
    data: { ...data, attributes: { ...data.attributes, ...set } },
  });
  if (!parsed.ok) return null;
  return {
    id: key,
    value: {
      type: 'engineer_note',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// Save: the name and the approval text are required (phase-02.md:33; 09q row 5); the tick is kept only when both are
// filled (Q-0708). Texts are stored trimmed.
export function engineerNoteChange(
  objects: Objects,
  noteId: string,
  draft: NoteDraft,
): { ok: true; change: Change } | { ok: false; reason: NoteRefusal } {
  const n = noteOf(objects, noteId);
  if (n === null) return { ok: false, reason: 'not_found' };
  const engineerName = draft.engineerName.trim();
  const approvedText = draft.approvedText.trim();
  if (engineerName === '') return { ok: false, reason: 'name_required' };
  if (approvedText === '') return { ok: false, reason: 'approved_required' };
  const c = change(n.key, n.data, { engineerName, approvedText, letterOnFile: draft.letterOnFile });
  return c === null ? { ok: false, reason: 'not_found' } : { ok: true, change: c };
}

// The edit that gives the note its letter (or takes it away with null).
export function engineerLetterChange(
  objects: Objects,
  noteId: string,
  fileId: string | null,
): Change | null {
  const n = noteOf(objects, noteId);
  return n === null ? null : change(n.key, n.data, { fileId });
}

export type LetterCheck =
  | { ok: true; contentType: SourceContentType }
  | { ok: false; reason: 'not_letter' | 'too_large' | 'empty' };

// The engineer_letter kind's file types: PDF, JPEG, PNG or HEIC.
export function checkEngineerLetter(name: string, size: number): LetterCheck {
  const r = checkFile(name, size);
  if (!r.ok) {
    if (r.reason === 'too_large' || r.reason === 'empty') return { ok: false, reason: r.reason };
    return { ok: false, reason: 'not_letter' };
  }
  if (!kindTakes('engineer_letter', r.contentType)) return { ok: false, reason: 'not_letter' };
  return { ok: true, contentType: r.contentType };
}

type Upload =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'failed'; code: 'not_authorized' | 'upload_failed' }
  | { kind: 'refused'; reason: 'not_letter' | 'too_large' | 'empty' };

export type EngineerNoteFormProps = {
  store: ModelStore;
  noteId: string;
  canEdit: boolean;
  // Without a project id there is nowhere to send a letter, so Attach is not offered.
  projectId?: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
};

const actionKey = (a: Attrs['action']) => `office.engineer.action.${a}` as MessageKey;

export function EngineerNoteForm({
  store,
  noteId,
  canEdit,
  projectId,
  fetchImpl,
  retryDelaysMs,
}: EngineerNoteFormProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const note = noteOf(objects, noteId);
  const [draft, setDraft] = useState<NoteDraft>(() => ({
    engineerName: note?.data.attributes.engineerName ?? '',
    approvedText: note?.data.attributes.approvedText ?? '',
    letterOnFile: note?.data.attributes.letterOnFile ?? false,
  }));
  const [error, setError] = useState<MessageKey | null>(null);
  const [upload, setUpload] = useState<Upload>({ kind: 'idle' });
  const pending = useRef<{
    file: { name: string; blob: Blob; contentType: SourceContentType } | null;
    attempt: { current: PhotoAttempt };
  }>({ file: null, attempt: { current: null } });
  const input = useRef<HTMLInputElement>(null);

  if (note === null) return null;
  const a = note.data.attributes;
  const required = engineerRequired(note.data);
  const mayAttach = canEdit && projectId !== undefined;
  const mayTick = canMarkLetterOnFile(draft);

  const send = async () => {
    const p = pending.current;
    if (p.file === null || projectId === undefined) return;
    setUpload({ kind: 'uploading' });
    try {
      const fileId = await uploadPinPhoto(projectId, p.file, p.attempt, {
        kind: 'engineer_letter',
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(retryDelaysMs ? { retryDelaysMs } : {}),
      });
      const c = engineerLetterChange(store.getState().objects, noteId, fileId);
      if (c !== null) store.applyEdit([c]);
      p.attempt.current = null;
      p.file = null;
      setUpload({ kind: 'idle' });
    } catch (e) {
      setUpload({ kind: 'failed', code: e instanceof PinPhotoError ? e.code : 'upload_failed' });
    }
  };

  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    const check = checkEngineerLetter(file.name, file.size);
    if (!check.ok) {
      setUpload({ kind: 'refused', reason: check.reason });
      return;
    }
    pending.current = {
      file: { name: file.name, blob: file, contentType: check.contentType },
      attempt: { current: null },
    };
    void send();
  };

  const save = () => {
    const r = engineerNoteChange(store.getState().objects, noteId, {
      ...draft,
      letterOnFile: draft.letterOnFile && mayTick,
    });
    if (!r.ok) {
      setError(r.reason === 'not_found' ? 'error.invalid_input' : NOTE_REFUSALS[r.reason]);
      return;
    }
    setError(null);
    store.applyEdit([r.change]);
  };

  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="engineer_note">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title} data-testid="inspector-title">
            {t('office.engineer.title')}
          </span>
          <span className={styles.subtitle} data-testid="inspector-subtitle">
            {t(actionKey(a.action))}
          </span>
        </div>
        {canEdit ? null : (
          <span className={styles.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      {required ? (
        <div className={styles.flag} data-testid="engineer-required" role="status">
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t('office.engineer.required')}
          </span>
        </div>
      ) : (
        <p className={`${styles.section} ${styles.hint}`} data-testid="engineer-cleared">
          {t('office.engineer.cleared')}
        </p>
      )}
      {canEdit ? (
        <div className={styles.section} data-testid="engineer-form">
          <label className={styles.field}>
            {t('office.engineer.name')}
            <input
              className={styles.input}
              data-testid="engineer-name"
              value={draft.engineerName}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, engineerName: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            {t('office.engineer.approved')}
            <textarea
              className={styles.input}
              data-testid="engineer-approved"
              value={draft.approvedText}
              maxLength={2000}
              rows={3}
              onChange={(e) => setDraft({ ...draft, approvedText: e.target.value })}
            />
          </label>
          <span className={styles.field}>{t('office.engineer.letter')}</span>
          <p className={styles.hint} data-testid="engineer-letter-state">
            {t(a.fileId === null ? 'office.engineer.no_letter' : 'office.engineer.letter_attached')}
          </p>
          {upload.kind === 'uploading' ? (
            <p className={styles.hint} data-testid="engineer-letter-uploading">
              {t('office.engineer.uploading')}
            </p>
          ) : null}
          {upload.kind === 'failed' ? (
            <p className={styles.error} data-testid="engineer-letter-failed" role="alert">
              {t(
                upload.code === 'not_authorized'
                  ? 'error.not_authorized'
                  : 'office.engineer.upload_failed',
              )}
            </p>
          ) : null}
          {upload.kind === 'refused' ? (
            <p className={styles.error} data-testid="engineer-letter-refused" role="alert">
              {t(
                upload.reason === 'not_letter'
                  ? 'office.engineer.not_letter'
                  : upload.reason === 'too_large'
                    ? 'office.engineer.too_large'
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
                data-testid="engineer-letter-input"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className={styles.small}
                data-testid="engineer-letter-attach"
                disabled={upload.kind === 'uploading'}
                onClick={() => input.current?.click()}
              >
                {t(a.fileId === null ? 'office.engineer.attach' : 'office.engineer.replace')}
              </button>
            </>
          ) : null}
          <label className={styles.check}>
            <input
              type="checkbox"
              data-testid="engineer-on-file"
              checked={draft.letterOnFile && mayTick}
              disabled={!mayTick}
              onChange={(e) => setDraft({ ...draft, letterOnFile: e.target.checked })}
            />
            {t('office.engineer.on_file')}
          </label>
          {mayTick ? null : (
            <p className={styles.hint} data-testid="engineer-on-file-hint">
              {t('office.engineer.on_file_hint')}
            </p>
          )}
          {error === null ? null : (
            <p className={styles.error} role="alert" data-testid="engineer-save-error">
              {t(error)}
            </p>
          )}
          <button type="button" className={styles.small} data-testid="engineer-save" onClick={save}>
            {t('office.engineer.save')}
          </button>
        </div>
      ) : a.engineerName !== '' || a.approvedText !== '' ? (
        <div className={styles.section} data-testid="engineer-read-only">
          <span className={styles.field}>{t('office.engineer.name')}</span>
          <span className={styles.readOnly} data-testid="engineer-name-read">
            {a.engineerName}
          </span>
          <span className={styles.field}>{t('office.engineer.approved')}</span>
          <span className={styles.readOnly} data-testid="engineer-approved-read">
            {a.approvedText}
          </span>
        </div>
      ) : null}
    </div>
  );
}
