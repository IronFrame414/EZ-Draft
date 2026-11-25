'use client';
// EZD-1415 (S17b Ceiling field "Ceiling height for the room; Optional"; board label "Ceiling at wall"). Typed as a
// length (feet, inches, fractions to 1/16"; packages/geometry parseLength) and kept on leaving the field; empty
// clears it. The screen keys the field by room, so switching rooms starts it again. The measurement keypad that also types here is EZD-1416.
import { useId, useState } from 'react';
import { formatLength, parseLength } from '@ezdraft/geometry';
import { useT } from '../lib/messages';
import styles from './FieldMeasure.module.css';

const show = (inches: number | null) => (inches === null ? '' : formatLength(inches, 16));

export function CeilingField({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (inches: number | null) => void;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(show(value));
  const [refused, setRefused] = useState(false);

  const commit = () => {
    if (text.trim() === '') {
      setRefused(false);
      if (value !== null) onChange(null);
      return;
    }
    const parsed = parseLength(text, 'wall_room');
    if (!parsed.ok) {
      setRefused(true);
      return;
    }
    setRefused(false);
    setText(show(parsed.inches));
    if (parsed.inches !== value) onChange(parsed.inches);
  };

  return (
    <div className={styles.field} data-field="ceiling">
      <label className={styles.fieldLabel} htmlFor={id}>
        {t('field.measure.ceiling')}
      </label>
      <input
        id={id}
        className={styles.fieldInput}
        value={text}
        disabled={disabled}
        aria-invalid={refused}
        aria-describedby={refused ? `${id}-refused` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      {refused ? (
        <span id={`${id}-refused`} className={styles.refused} role="alert">
          {t('field.measure.length_refused')}
        </span>
      ) : null}
    </div>
  );
}
