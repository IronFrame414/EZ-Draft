'use client';
// EZD-505 (S05 Controls, inspector, beams: "Placement select", "Height AFF input: Shown for Level beams in vault.
// Disabled when Match = Adjoining room (value copied)", "Match select: Level beams only", "Size W x H input",
// "Spacing input: Mutually exclusive with Count", "Count input", "Length input: Default is wall to wall span",
// "Direction select", "End detail select"; S05 Validation "Level beams in a vault must sit below the ridge and at or
// above the wall plate; warn otherwise", "Typed heights: invalid format shows inline error, value not applied";
// board S05Ceiling "Faux beams", "5 beams · family room"; AC-EZD-505-1): the inspector for one selected beam set.
// Without Edit model every field is read only. Each change is one edit (one undo step).
import { useState, useSyncExternalStore, type ReactElement, type KeyboardEvent } from 'react';
import {
  BEAM_DIRECTIONS,
  BEAM_END_DETAILS,
  BEAM_MATCHES,
  BEAM_PLACEMENTS,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { beamEdit, beamView, type BeamEdit, type BeamView } from './beam-edits';
import { BeamSection } from '../inspector/BeamSection';
import styles from '../inspector/InspectorPanel.module.css';

export type BeamPanelProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  beamId: string;
  canEdit: boolean;
};

type TextField = Extract<BeamEdit, { text: string }>['field'];

function BeamText({
  field,
  label,
  value,
  placeholder,
  disabled,
  onText,
}: {
  field: TextField;
  label: string;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onText: (field: TextField, text: string) => MessageKey | null;
}): ReactElement {
  const t = useT();
  const testId = `beam-${field}`;
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<MessageKey | null>(null);
  // A new value resets the draft and the error while rendering (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
    setError(null);
  }
  const commit = () => {
    if (draft === value) {
      setError(null);
      return;
    }
    const key = onText(field, draft);
    if (key === null) setError(null);
    else setError(key);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setError(null);
    }
  };
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={32}
        aria-invalid={error !== null}
        placeholder={placeholder}
        disabled={disabled}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {error === null ? null : (
        <span className={styles.error} role="alert" data-testid={`${testId}-error`}>
          {t(error)}
        </span>
      )}
    </label>
  );
}

function Choice<T extends string>({
  testId,
  label,
  value,
  options,
  optionKey,
  disabled,
  isDisabled,
  onPick,
}: {
  testId: string;
  label: string;
  value: T;
  options: readonly T[];
  optionKey: (v: T) => MessageKey;
  disabled: boolean;
  isDisabled?: (v: T) => boolean;
  onPick: (v: T) => void;
}): ReactElement {
  const t = useT();
  return (
    <label className={styles.field}>
      {label}
      <select
        className={styles.select}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value as T;
          if (options.includes(v)) onPick(v);
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} disabled={isDisabled?.(o) ?? false}>
            {t(optionKey(o))}
          </option>
        ))}
      </select>
    </label>
  );
}

const WARNING_KEYS: Record<BeamView['warnings'][number], { title: MessageKey; hint: MessageKey }> =
  {
    above_ridge: {
      title: 'office.beam.warning.above_ridge',
      hint: 'office.beam.warning.above_ridge_hint',
    },
    below_plate: {
      title: 'office.beam.warning.below_plate',
      hint: 'office.beam.warning.below_plate_hint',
    },
  };

export function BeamPanel({ store, beamId, canEdit }: BeamPanelProps): ReactElement | null {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const [refusal, setRefusal] = useState<MessageKey | null>(null);
  const view = beamView(objects, beamId);
  if (view === null) return null;

  const apply = (edit: BeamEdit): MessageKey | null => {
    const r = beamEdit(store.getState().objects, beamId, edit);
    if (!r.ok) return r.messageKey;
    store.applyEdit([r.change]);
    return null;
  };
  const pick = (edit: BeamEdit) => setRefusal(apply(edit));
  const onText = (field: TextField, text: string) => apply({ field, text });
  const level = view.placement === 'level_in_vault';
  const subtitle =
    view.roomName === null
      ? t('office.beam.subtitle_no_room', { count: String(view.count) })
      : t('office.beam.subtitle', { count: String(view.count), room: view.roomName });

  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="beam">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title} data-testid="inspector-title">
            {t('office.beam.title')}
          </span>
          <span className={styles.subtitle} data-testid="inspector-subtitle">
            {subtitle}
          </span>
        </div>
        {canEdit ? (
          <span className={styles.tag} data-testid="beam-status">
            {t(`office.inspector.status.${view.status}`)}
          </span>
        ) : (
          <span className={styles.badge} data-testid="inspector-view-only">
            <Icon name="visibility" size={14} />
            {t('office.inspector.view_only')}
          </span>
        )}
      </div>
      {view.warnings.map((w) => (
        <div key={w} className={styles.flag} role="alert" data-testid={`beam-warning-${w}`}>
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t(WARNING_KEYS[w].title)}
          </span>
          <span className={styles.flagHint}>{t(WARNING_KEYS[w].hint)}</span>
        </div>
      ))}
      <div className={styles.section}>
        <Choice
          testId="beam-placement"
          label={t('office.beam.placement')}
          value={view.placement}
          options={BEAM_PLACEMENTS}
          optionKey={(v) => `office.beam.placement.${v}`}
          disabled={!canEdit}
          onPick={(value) => pick({ field: 'placement', value })}
        />
        {level ? (
          <div className={styles.grid2}>
            <BeamText
              field="heightAff"
              label={t('office.beam.height_aff')}
              value={view.heightAff}
              disabled={!canEdit || view.match === 'adjoining'}
              onText={onText}
            />
            <Choice
              testId="beam-match"
              label={t('office.beam.match')}
              value={view.match}
              options={BEAM_MATCHES}
              optionKey={(v) => `office.beam.match.${v}`}
              disabled={!canEdit}
              isDisabled={(v) => v === 'adjoining' && !view.canMatch}
              onPick={(value) => pick({ field: 'match', value })}
            />
          </div>
        ) : null}
        <div className={styles.grid2}>
          <BeamText
            field="size"
            label={t('office.beam.size')}
            value={view.size}
            disabled={!canEdit}
            onText={onText}
          />
          <BeamText
            field="spacing"
            label={t('office.beam.spacing')}
            value={view.spacing}
            disabled={!canEdit}
            onText={onText}
          />
        </div>
        <div className={styles.grid2}>
          <BeamText
            field="count"
            label={t('office.beam.count')}
            value={view.countText}
            disabled={!canEdit}
            onText={onText}
          />
          <BeamText
            field="length"
            label={t('office.beam.length')}
            value={view.length}
            placeholder={t('office.beam.length_wall_to_wall')}
            disabled={!canEdit}
            onText={onText}
          />
        </div>
        <div className={styles.grid2}>
          <Choice
            testId="beam-direction"
            label={t('office.beam.direction')}
            value={view.direction}
            options={BEAM_DIRECTIONS}
            optionKey={(v) => `office.beam.direction.${v}`}
            disabled={!canEdit}
            onPick={(value) => pick({ field: 'direction', value })}
          />
          <Choice
            testId="beam-end-detail"
            label={t('office.beam.end_detail')}
            value={view.endDetail}
            options={BEAM_END_DETAILS}
            optionKey={(v) => `office.beam.end_detail.${v}`}
            disabled={!canEdit}
            onPick={(value) => pick({ field: 'endDetail', value })}
          />
        </div>
        {refusal === null ? null : (
          <p className={styles.error} role="alert" data-testid="beam-refusal">
            {t(refusal)}
          </p>
        )}
      </div>
      {/* EZD-506: Section A-A, read only, re-drawn from the same snapshot on every edit. */}
      <BeamSection objects={objects} beamId={beamId} />
    </div>
  );
}
