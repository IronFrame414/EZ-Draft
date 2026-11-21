'use client';
// EZD-1416 (S17b Keypad "digits, ', ", 1/2, 1/4, 1/8, 1/16, space, backspace; Type the measurement"; Next wall
// "Saves the value and moves to the next wall"; board S17bFieldMeasure key order). No laser input and no input-mode
// label (Q-0759). Backspace shows the ⌫ character (the icon set has no backspace icon). The typed text is parsed by the length parser on Next wall (Q-0561).
import { useT } from '../lib/messages';
import styles from './FieldMeasure.module.css';

export type KeypadKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | "'"
  | '"'
  | '1/2'
  | '1/4'
  | '1/8'
  | '1/16'
  | 'sp'
  | 'back';

/** The board's rows; Next wall takes the last two places of the bottom row. */
export const KEYPAD_ROWS: readonly (readonly KeypadKey[])[] = [
  ['1', '2', '3', "'", '"'],
  ['4', '5', '6', '1/2', '1/4'],
  ['7', '8', '9', '1/8', '1/16'],
  ['back', '0', 'sp'],
];

/** Longest text the keypad builds (the length parser refuses over 32 characters). */
export const MAX_KEYPAD_TEXT = 24;

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/**
 * The text after one key. A fraction right after a number or a foot mark gets a space first, so 4 then 1/2 reads
 * "4 1/2"; a number after a foot mark does too, so 10 ' 4 reads "10' 4" as on the board. A space is not doubled or typed first. Backspace removes one character.
 */
export function applyKey(text: string, key: KeypadKey): string {
  if (key === 'back') return text.slice(0, -1);
  let next: string;
  if (key === 'sp') {
    if (text === '' || text.endsWith(' ')) return text;
    next = `${text} `;
  } else if (key === "'" || key === '"') {
    next = `${text.trimEnd()}${key}`;
  } else if (key.includes('/')) {
    const last = text.at(-1);
    next = isDigit(last) || last === "'" ? `${text} ${key}` : `${text}${key}`;
  } else {
    next = text.endsWith("'") ? `${text} ${key}` : `${text}${key}`;
  }
  return next.length > MAX_KEYPAD_TEXT ? text : next;
}

export function Keypad({
  disabled,
  onKey,
  onNext,
}: {
  disabled: boolean;
  onKey: (key: KeypadKey) => void;
  onNext: () => void;
}) {
  const t = useT();
  const label = (k: KeypadKey) => (k === 'back' ? t('field.measure.key.backspace') : undefined);
  return (
    <div className={styles.keypad} role="group" aria-label={t('field.measure.keypad')} data-testid="keypad">
      {KEYPAD_ROWS.flat().map((k) => (
        <button
          key={k}
          type="button"
          className={/^\d$/.test(k) ? styles.key : `${styles.key} ${styles.keyMark}`}
          data-key={k}
          aria-label={label(k)}
          disabled={disabled}
          onClick={() => onKey(k)}
        >
          {k === 'back' ? <span aria-hidden="true">⌫</span> : k}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.key} ${styles.keyNext}`}
        data-key="next"
        disabled={disabled}
        onClick={onNext}
      >
        {t('field.measure.next_wall')}
      </button>
    </div>
  );
}
