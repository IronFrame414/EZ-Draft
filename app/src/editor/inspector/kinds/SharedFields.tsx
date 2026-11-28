'use client';
// EZD-1915 (AC-EZD-1915-1; editor plan 2.5, 5.3 "inspector/kinds/"): the pieces the wall, opening and bulk panels
// share, moved out of InspectorPanel.tsx unchanged (EZD-213b D-Text, D-Length field, D-Controls, D-View only;
// EZD-214 Status). One copy each: WallPanel.tsx, OpeningPanel.tsx and BulkPanel.tsx import them from here.
import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  IMPACT_RATINGS,
  OBJECT_STATUSES,
  SHUTTER_TYPES,
  type ImpactRating,
  type ObjectStatus,
  type ShutterType,
} from '@ezdraft/geometry';
import { Icon } from '../../../components/icon/Icon';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import type { InspectorEdit } from '../inspector-edits';
import { lengthEdit, roughOpeningEdit, type TextField } from '../inspector-input';
import type { LayerRow, Shared } from '../inspector-view';
import styles from '../InspectorPanel.module.css';
import type { InspectorContentProps } from './types';

// D-Text: sub-line and view-only layer parts are joined by this constant.
export const SEPARATOR = ' · ';

// D-Length field: `MAX_TEXT_LENGTH` of G/length.ts; a rough opening is two lengths and its sign.
export const MAX_TEXT_LENGTH = 32;
export const MAX_ROUGH_OPENING_LENGTH = 65;

export type TFn = ReturnType<typeof useT>;

// ---- Shared pieces ----

export type ControlError = { testId: string; key: MessageKey } | null;

// D-Controls: one refusal at a time under its control, cleared by the next commit.
export function useControlCommit(onCommit: InspectorContentProps['onCommit']) {
  const [error, setError] = useState<ControlError>(null);
  const run = useCallback((testId: string, result: () => MessageKey | null) => {
    const key = result();
    setError(key === null ? null : { testId, key });
  }, []);
  const commit = useCallback(
    (testId: string, edits: readonly InspectorEdit[]) => run(testId, () => onCommit(edits)),
    [onCommit, run],
  );
  return { error, run, commit };
}

export function ControlErrorLine({ error, testId }: { error: ControlError; testId: string }) {
  const t = useT();
  if (error === null || error.testId !== testId) return null;
  return (
    <p className={styles.error} role="alert" data-testid={`${testId}-error`}>
      {t(error.key)}
    </p>
  );
}

export function Header({
  title,
  subtitle,
  canEdit,
}: {
  title: string;
  subtitle: string;
  canEdit: boolean;
}) {
  const t = useT();
  return (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <span className={styles.title} data-testid="inspector-title">
          {title}
        </span>
        <span className={styles.subtitle} data-testid="inspector-subtitle">
          {subtitle}
        </span>
      </div>
      {canEdit ? null : (
        <span className={styles.badge} data-testid="inspector-view-only">
          <Icon name="visibility" size={14} />
          {t('office.inspector.view_only')}
        </span>
      )}
    </div>
  );
}

// D-Length field.
export function LengthField({
  testId,
  label,
  value,
  mixed,
  onText,
  inputRef,
  maxLength,
}: {
  testId: string;
  label: string;
  value: string;
  mixed: boolean;
  onText: (text: string) => MessageKey | null;
  inputRef?: Ref<HTMLInputElement>;
  maxLength: number;
}) {
  const t = useT();
  const start = mixed ? '' : value;
  const [draft, setDraft] = useState(start);
  const [error, setError] = useState<MessageKey | null>(null);
  // A new value resets the draft and the error while rendering (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState(start);
  if (shown !== start) {
    setShown(start);
    setDraft(start);
    setError(null);
  }

  const commit = () => {
    if (draft === start) {
      setError(null);
      return;
    }
    const key = onText(draft);
    if (key === null) {
      setDraft(start);
      setError(null);
    } else {
      setError(key);
    }
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(start);
      setError(null);
    }
  };
  return (
    <>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={error !== null}
        placeholder={mixed ? t('office.inspector.mixed') : undefined}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {error === null ? null : (
        <p className={styles.error} role="alert" data-testid={`${testId}-error`}>
          {t(error)}
        </p>
      )}
    </>
  );
}

export const lengthText =
  (field: TextField, onCommit: InspectorContentProps['onCommit']) =>
  (text: string): MessageKey | null => {
    const p = lengthEdit(field, text);
    return p.ok ? onCommit([p.edit]) : p.messageKey;
  };

export const roughText =
  (onCommit: InspectorContentProps['onCommit']) =>
  (text: string): MessageKey | null => {
    const p = roughOpeningEdit(text);
    return p.ok ? onCommit([p.edit]) : p.messageKey;
  };

// A labelled length: an input when editing, plain text (D-View only) otherwise.
export function TextBox({
  testId,
  label,
  shared,
  canEdit,
  onText,
  inputRef,
  maxLength = MAX_TEXT_LENGTH,
  head = false,
}: {
  testId: string;
  label: string;
  shared: Shared<string>;
  canEdit: boolean;
  onText: (text: string) => MessageKey | null;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  head?: boolean;
}) {
  const t = useT();
  return (
    <div className={styles.field}>
      <span className={head ? styles.head : undefined}>{label}</span>
      {canEdit ? (
        <LengthField
          testId={testId}
          label={label}
          value={shared.mixed ? '' : shared.value}
          mixed={shared.mixed}
          onText={onText}
          inputRef={inputRef}
          maxLength={maxLength}
        />
      ) : (
        <span className={styles.plain} data-testid={testId}>
          {shared.mixed ? t('office.inspector.mixed') : shared.value}
        </span>
      )}
    </div>
  );
}

export const one = <T,>(value: T): Shared<T> => ({ mixed: false, value });

function statusDot(status: ObjectStatus): string {
  if (status === 'demo') return styles.dotDemo!;
  if (status === 'new') return styles.dotNew!;
  return styles.dotExisting!;
}

export function layerRowsReadOnly(t: TFn, rows: readonly LayerRow[]): ReactNode {
  return rows.map((r, i) => (
    <div key={i} className={styles.row} data-testid={`inspector-layer-${i}`}>
      <span data-testid={`inspector-layer-${i}-material`}>
        {t(`office.inspector.material.${r.material}`)}
      </span>{' '}
      <span className={styles.mono} data-testid={`inspector-layer-${i}-thickness`}>
        {r.thickness}
      </span>
    </div>
  ));
}

export function layerLine(t: TFn, rows: readonly LayerRow[]): string {
  return rows
    .map((r) =>
      t('office.inspector.layer_value', {
        material: t(`office.inspector.material.${r.material}`),
        thickness: r.thickness,
      }),
    )
    .join(SEPARATOR);
}

export function ImpactSection({
  impact,
  shutter,
  canEdit,
  commit,
  error,
}: {
  impact: Shared<ImpactRating>;
  shutter: Shared<ShutterType | null>;
  canEdit: boolean;
  commit: (testId: string, edits: readonly InspectorEdit[]) => void;
  error: ControlError;
}) {
  const t = useT();
  const isShutter = !impact.mixed && impact.value === 'shutter';
  if (!canEdit) {
    return (
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.impact')}</span>
        <span className={styles.plain} data-testid="inspector-impact">
          {impact.mixed
            ? t('office.inspector.mixed')
            : t(`office.inspector.impact.${impact.value}`)}
        </span>
        {isShutter && (shutter.mixed || shutter.value !== null) ? (
          <div className={styles.field}>
            <span>{t('office.inspector.field.shutter_type')}</span>
            <span className={styles.plain} data-testid="inspector-shutter-type">
              {shutter.mixed
                ? t('office.inspector.mixed')
                : t(`office.inspector.shutter.${shutter.value!}`)}
            </span>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.section}>
      <span className={styles.head}>{t('office.inspector.field.impact')}</span>
      <div
        className={styles.segments}
        role="radiogroup"
        aria-label={t('office.inspector.field.impact')}
        data-testid="inspector-impact"
      >
        {IMPACT_RATINGS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={!impact.mixed && impact.value === v}
            className={styles.segment}
            data-testid={`inspector-impact-${v}`}
            onClick={() => {
              if (!impact.mixed && impact.value === v) return;
              commit('inspector-impact', [{ field: 'impactRating', value: v }]);
            }}
          >
            {t(`office.inspector.impact.${v}`)}
          </button>
        ))}
      </div>
      {impact.mixed ? (
        <span className={`${styles.hint} ${styles.mixed}`} data-testid="inspector-impact-mixed">
          {t('office.inspector.mixed')}
        </span>
      ) : null}
      <ControlErrorLine error={error} testId="inspector-impact" />
      {isShutter ? (
        <label className={styles.field}>
          {t('office.inspector.field.shutter_type')}
          <select
            className={styles.select}
            data-testid="inspector-shutter-type"
            value={shutter.mixed || shutter.value === null ? '' : shutter.value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') return;
              commit('inspector-shutter-type', [{ field: 'shutterType', value: v as ShutterType }]);
            }}
          >
            <option value="">{t('office.inspector.shutter_none')}</option>
            {SHUTTER_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`office.inspector.shutter.${s}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <ControlErrorLine error={error} testId="inspector-shutter-type" />
    </div>
  );
}

// EZD-214 (05 Q-0664 "Status on objects"; S03dWallSelected Status row; Q-0630 row 9): the Status select with the
// board's dot for the current value; Mixed when the selection differs; plain text for a view-only user.
export function StatusSection({
  status,
  canEdit,
  commit,
  error,
}: {
  status: Shared<ObjectStatus>;
  canEdit: boolean;
  commit: (testId: string, edits: readonly InspectorEdit[]) => void;
  error: ControlError;
}) {
  const t = useT();
  const text = status.mixed
    ? t('office.inspector.mixed')
    : t(`office.inspector.status.${status.value}`);
  if (!canEdit) {
    return (
      <div className={styles.section} data-testid="inspector-status-section">
        <div className={styles.field}>
          <span>{t('office.inspector.field.status')}</span>
          <span className={styles.plain} data-testid="inspector-status">
            {text}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.section} data-testid="inspector-status-section">
      <label className={styles.field}>
        <span>{t('office.inspector.field.status')}</span>
        <span className={styles.statusSelect}>
          {status.mixed ? null : (
            <span
              className={`${styles.dot} ${statusDot(status.value)}`}
              data-testid="inspector-status-dot"
              data-status={status.value}
            />
          )}
          <select
            className={styles.select}
            data-testid="inspector-status"
            value={status.mixed ? '' : status.value}
            onChange={(e) => {
              const v = e.target.value as ObjectStatus;
              if (!OBJECT_STATUSES.includes(v)) return;
              commit('inspector-status', [{ field: 'status', value: v }]);
            }}
          >
            {status.mixed ? (
              <option value="" disabled>
                {t('office.inspector.mixed')}
              </option>
            ) : null}
            {OBJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`office.inspector.status.${s}`)}
              </option>
            ))}
          </select>
        </span>
      </label>
      <ControlErrorLine error={error} testId="inspector-status" />
    </div>
  );
}

export function RoughOpeningSection({
  shared,
  auto,
  canEdit,
  onCommit,
}: {
  shared: Shared<string>;
  auto: boolean;
  canEdit: boolean;
  onCommit: InspectorContentProps['onCommit'];
}) {
  const t = useT();
  const label = t('office.inspector.field.rough_opening');
  return (
    <div className={styles.section}>
      <div className={styles.headRowCenter}>
        <span className={styles.head}>{label}</span>
        {auto ? (
          <span className={styles.tag} data-testid="inspector-rough-opening-auto">
            {t('office.inspector.auto')}
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <LengthField
          testId="inspector-rough-opening"
          label={label}
          value={shared.mixed ? '' : shared.value}
          mixed={shared.mixed}
          onText={roughText(onCommit)}
          maxLength={MAX_ROUGH_OPENING_LENGTH}
        />
      ) : (
        <span className={styles.plain} data-testid="inspector-rough-opening">
          {shared.mixed ? t('office.inspector.mixed') : shared.value}
        </span>
      )}
    </div>
  );
}
