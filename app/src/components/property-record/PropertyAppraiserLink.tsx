'use client';

// EZD-711 (S01 Property appraiser link "Paste link; app reads parcel number, owner, legal description, year built,
// living area; user confirms each field ... On read failure, offer 'Paste page text' or 'Paste screenshot' for AI
// extraction. Year built before 1978 sets the lead flag"; S01 Validation as changed by Q-0802 "Couldn't read this
// page. Paste the page text or a screenshot."; S13 Controls "Property appraiser import"; board S01bWizard column 1):
// the link box, used in New project step 1 and in the Sheets Property appraiser import dialog. Each read field has a
// tick; only ticked fields are passed on (onChange), so only confirmed fields reach the title block.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import {
  PASTED_TEXT_MAX_BYTES,
  PROPERTY_FIELDS,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  confirmedFields,
  isPre1978,
  type PropertyField,
  type PropertyFields,
} from '../../lib/property-record/fields';
import type { ConfirmedRecord } from '../../lib/property-record/property-record';
import { getRealtimeHub } from '../../lib/realtime';
import type { UserHandle } from '../../lib/realtime/hub';
import type { MessageKey } from '../../server/messages/catalog';
import { Icon } from '../icon/Icon';
import { StateButton } from '../states/StateButton';
import { startRead, watchRead, type ReadAnswer, type ReadInput } from './appraiser-read-client';
import styles from './PropertyAppraiserLink.module.css';

const FIELD_KEYS: Record<PropertyField, MessageKey> = {
  parcelNo: 'office.property_record.field.parcel_no',
  owner: 'office.property_record.field.owner',
  legalDescription: 'office.property_record.field.legal_description',
  yearBuilt: 'office.property_record.field.year_built',
  livingArea: 'office.property_record.field.living_area',
};

export type PropertyAppraiserLinkProps = {
  // Null in the New project wizard (no project yet).
  projectId: string | null;
  // The project's saved record (Sheets): shown as read with its filled fields ticked.
  initial?: { sourceUrl: string | null; fields: PropertyFields } | null;
  onChange: (record: ConfirmedRecord | null) => void;
  disabled?: boolean;
  // Test seams.
  channel?: () => Pick<UserHandle, 'on' | 'onResync' | 'ready' | 'release'>;
  fetchFn?: typeof fetch;
};

type ReadState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'read'; fields: PropertyFields }
  | { kind: 'failed'; denied: boolean };

const utf8Bytes = (s: string) => new TextEncoder().encode(s).byteLength;

export function PropertyAppraiserLink({
  projectId,
  initial = null,
  onChange,
  disabled = false,
  channel,
  fetchFn,
}: PropertyAppraiserLinkProps): ReactElement {
  const t = useT();
  const [url, setUrl] = useState(initial?.sourceUrl ?? '');
  const [state, setState] = useState<ReadState>(
    initial && PROPERTY_FIELDS.some((f) => initial.fields[f] !== null)
      ? { kind: 'read', fields: initial.fields }
      : { kind: 'idle' },
  );
  const [ticked, setTicked] = useState<ReadonlySet<PropertyField>>(
    () => new Set(initial ? PROPERTY_FIELDS.filter((f) => initial.fields[f] !== null) : []),
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<MessageKey | null>(null);
  const [readUrl, setReadUrl] = useState<string | null>(initial?.sourceUrl ?? null);
  const stop = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => stop.current?.(), []);

  const passOn = (fields: PropertyFields | null, tick: ReadonlySet<PropertyField>, source: string | null) => {
    if (fields === null || tick.size === 0) {
      onChange(null);
      return;
    }
    onChange({ fields: confirmedFields(fields, tick), sourceUrl: source });
  };

  const finish = (answer: ReadAnswer, source: string | null) => {
    if (answer.status === 'read') {
      setState({ kind: 'read', fields: answer.fields });
      setTicked(new Set());
      setReadUrl(source);
      setPasteOpen(false);
      passOn(answer.fields, new Set(), source);
      return;
    }
    setState({ kind: 'failed', denied: answer.status === 'failed' && answer.denied === true });
    setPasteOpen(true);
    passOn(null, new Set(), null);
  };

  const run = async (input: ReadInput) => {
    stop.current?.();
    stop.current = null;
    setState({ kind: 'reading' });
    const source = input.kind === 'link' ? input.url.trim() : url.trim() === '' ? null : url.trim();
    const started = await startRead(projectId, input, fetchFn);
    if (!('jobId' in started)) {
      finish(started, source);
      return;
    }
    const handle = channel ? channel() : getRealtimeHub().user();
    const off = watchRead(
      handle,
      started.jobId,
      (answer) => {
        off();
        handle.release();
        stop.current = null;
        finish(answer, source);
      },
      fetchFn,
    );
    stop.current = () => {
      off();
      handle.release();
    };
  };

  const readLink = () => {
    if (url.trim() === '' || disabled) return;
    void run({ kind: 'link', url: url.trim() });
  };

  const readText = () => {
    const text = pasted.trim();
    if (text === '' || disabled) return;
    if (utf8Bytes(text) > PASTED_TEXT_MAX_BYTES) {
      setPasteError('office.property_record.text_too_long');
      return;
    }
    setPasteError(null);
    void run({ kind: 'text', text });
  };

  const readScreenshot = (file: File) => {
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type) || file.size === 0 || file.size > SCREENSHOT_MAX_BYTES) {
      setPasteError('office.property_record.screenshot_invalid');
      return;
    }
    setPasteError(null);
    void run({ kind: 'screenshot', file });
  };

  const toggle = (f: PropertyField) => {
    if (state.kind !== 'read') return;
    const next = new Set(ticked);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setTicked(next);
    passOn(state.fields, next, readUrl);
  };

  const value = (fields: PropertyFields, f: PropertyField): ReactElement => {
    const v = fields[f];
    if (v === null) return <span className={styles.missing}>{t('office.property_record.not_found')}</span>;
    if (f === 'yearBuilt') {
      return (
        <span>
          <span className={styles.mono}>{String(v)}</span>
          <span data-testid="property-record-lead" className={styles.note}>
            {t(isPre1978(v as number) ? 'office.property_record.lead_on' : 'office.property_record.lead_off')}
          </span>
        </span>
      );
    }
    if (f === 'livingArea') {
      return (
        <span className={styles.mono}>
          {t('office.property_record.living_area_value', { n: (v as number).toLocaleString('en-US') })}
        </span>
      );
    }
    return <span className={f === 'parcelNo' ? styles.mono : undefined}>{String(v)}</span>;
  };

  const reading = state.kind === 'reading';
  const confirmed = state.kind === 'read' ? PROPERTY_FIELDS.filter((f) => ticked.has(f) && state.fields[f] !== null).length : 0;

  return (
    <div data-testid="property-record" className={styles.box}>
      <div className={styles.head}>
        <span className={styles.title}>{t('office.property_record.title')}</span>
        {state.kind === 'read' ? (
          <span
            data-testid="property-record-count"
            className={confirmed === 5 ? `${styles.pill} ${styles.pillDone}` : styles.pill}
          >
            {t('office.property_record.confirmed', { n: confirmed })}
          </span>
        ) : null}
      </div>
      <div className={styles.linkRow}>
        <input
          data-testid="property-record-url"
          className={styles.input}
          type="url"
          inputMode="url"
          aria-label={t('office.property_record.title')}
          placeholder={t('office.property_record.link_placeholder')}
          value={url}
          maxLength={2048}
          disabled={disabled || reading}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              readLink();
            }
          }}
        />
        {state.kind === 'read' && readUrl !== null ? (
          <span className={styles.ok} aria-hidden="true">
            <Icon name="check_circle" size={16} />
          </span>
        ) : null}
        <StateButton
          variant="secondary"
          data-testid="property-record-read"
          disabled={disabled || reading || url.trim() === ''}
          onClick={readLink}
        >
          {t('office.property_record.read')}
        </StateButton>
      </div>
      {reading ? (
        <p data-testid="property-record-reading" className={styles.hint} role="status">
          {t('office.property_record.reading')}
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        <p data-testid="property-record-failed" className={styles.error} role="alert">
          {t(state.denied ? 'error.not_authorized' : 'office.property_record.failed')}
        </p>
      ) : null}
      {state.kind === 'read' || state.kind === 'idle' ? (
        <p className={styles.hint}>
          {state.kind === 'read' ? `${t('office.property_record.hint')} ` : null}
          <button
            type="button"
            data-testid="property-record-paste-open"
            className={styles.link}
            disabled={disabled || pasteOpen}
            onClick={() => setPasteOpen(true)}
          >
            {t('office.property_record.paste_open')}
          </button>
        </p>
      ) : null}
      {pasteOpen && !reading ? (
        <div className={styles.paste}>
          <label className={styles.pasteLabel}>
            {t('office.property_record.paste_label')}
            <textarea
              data-testid="property-record-paste"
              className={styles.textarea}
              rows={4}
              placeholder={t('office.property_record.paste_placeholder')}
              value={pasted}
              disabled={disabled}
              onChange={(e) => setPasted(e.target.value)}
              onPaste={(e) => {
                const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
                if (file) {
                  e.preventDefault();
                  readScreenshot(file);
                }
              }}
            />
          </label>
          <div className={styles.pasteActions}>
            <StateButton
              variant="secondary"
              data-testid="property-record-read-text"
              disabled={disabled || pasted.trim() === ''}
              onClick={readText}
            >
              {t('office.property_record.read_text')}
            </StateButton>
            <StateButton
              variant="secondary"
              data-testid="property-record-screenshot"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="content_paste" size={16} />
              {t('office.property_record.screenshot')}
            </StateButton>
            <input
              ref={fileRef}
              data-testid="property-record-screenshot-file"
              type="file"
              accept={SCREENSHOT_TYPES.join(',')}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) readScreenshot(file);
              }}
            />
          </div>
          {pasteError !== null ? (
            <p data-testid="property-record-paste-error" className={styles.error} role="alert">
              {t(pasteError)}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.kind === 'read' ? (
        <ul className={styles.fields}>
          {PROPERTY_FIELDS.map((f) => {
            const has = state.fields[f] !== null;
            const on = has && ticked.has(f);
            return (
              <li key={f} className={styles.field}>
                <label className={styles.fieldLabel}>
                  <input
                    type="checkbox"
                    data-testid={`property-record-tick-${f}`}
                    className={styles.tick}
                    checked={on}
                    disabled={disabled || !has}
                    onChange={() => toggle(f)}
                  />
                  <span className={styles.name}>{t(FIELD_KEYS[f])}</span>
                </label>
                <span data-testid={`property-record-value-${f}`} className={styles.value}>
                  {value(state.fields, f)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
