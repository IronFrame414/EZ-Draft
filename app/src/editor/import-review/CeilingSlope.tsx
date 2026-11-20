'use client';

// EZD-312 (S02 Decisions "Ceiling slope items are fixed in the inspector with the same three inputs as Round 1:
// heights at points (low/high wall), pitch, or the value read from the mesh"; S05 Change ceiling "Heights accept
// typed formats (12'6", 12' 6 1/2", 150", 12.5')", Read heights from scan "Only when a GLB mesh exists"; AC-EZD-312-1):
// the inspector section of a ceiling slope item. Three inputs: Heights (low and high wall), Pitch (low wall and rise
// per 12) and From mesh (Read from mesh, only when the import has a GLB). A typed value commits on Enter (a
// keyboard-mode laser ends with Enter) or when the field loses focus, and only when it changed; each commit is a
// review fix (lib/imports/ceiling-slope.ts), so it accepts the item, is undone with Ctrl/Cmd+Z and is saved.
import { useState, type ReactElement } from 'react';
import { formatLength, parseLength, PLAN_DISPLAY_DENOMINATOR } from '@ezdraft/geometry';
import { HeaderButton } from '../../components/shell/HeaderButton';
import { useT } from '../../lib/messages';
import {
  SLOPE_INPUTS,
  slopeByPitch,
  slopeByPoints,
  slopeFromMesh,
  type CeilingSlopeFix,
  type SlopeInput,
  type SlopeRefusal,
  type SlopeResult,
} from '../../lib/imports/ceiling-slope';
import type { CeilingReading } from '../../lib/imports/polycam-glb/ceiling';
import { slopeText, type ReviewCeilingSlope, type Side } from '../../lib/imports/review';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './ImportReview.module.css';

const INPUT_LABEL: Record<SlopeInput, MessageKey> = {
  points: 'office.review.slope_points',
  pitch: 'office.review.slope_pitch',
  mesh: 'office.review.slope_mesh',
};

const SIDE_LABEL: Record<Side, MessageKey> = {
  north: 'office.review.slope_side_north',
  east: 'office.review.slope_side_east',
  south: 'office.review.slope_side_south',
  west: 'office.review.slope_side_west',
};

const REFUSED: Record<SlopeRefusal, MessageKey> = {
  height: 'office.review.slope_refused_height',
  order: 'office.review.slope_refused_order',
  pitch: 'office.review.slope_refused_pitch',
  no_ceiling: 'office.review.slope_refused_no_ceiling',
};

const lengthText = (inches: number) => formatLength(inches, PLAN_DISPLAY_DENOMINATOR);
const pitchText = (p: number) => String(Math.round(p * 100) / 100);

/** A typed pitch: "4", "9.4" or "4/12"; null when it is not a number. */
export function parsePitch(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:\/\s*12)?\s*$/.exec(text);
  return m ? Number(m[1]) : null;
}

export function CeilingSlopeFields({
  item,
  detected,
  fix,
  hasMesh,
  disabled,
  readMesh,
  onFix,
}: {
  /** The item as it stands (its fix applied). */
  item: ReviewCeilingSlope;
  /** The item as detected, for Scan reads. */
  detected: ReviewCeilingSlope;
  fix: CeilingSlopeFix | undefined;
  hasMesh: boolean;
  disabled: boolean;
  /** Reads the import's mesh ceiling (a fresh link each time); null when the mesh has no ceiling. */
  readMesh: () => Promise<CeilingReading | null>;
  onFix: (fix: CeilingSlopeFix) => void;
}): ReactElement {
  const t = useT();
  const [input, setInput] = useState<SlopeInput>(fix?.input ?? 'points');
  const shown = {
    low: lengthText(item.lowHeight),
    high: lengthText(item.highHeight),
    pitch: pitchText(item.pitchPer12),
  };
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  const [refused, setRefused] = useState<MessageKey | null>(null);
  const [reading, setReading] = useState(false);
  if (seen.low !== shown.low || seen.high !== shown.high || seen.pitch !== shown.pitch) {
    setSeen(shown);
    setText(shown);
    setRefused(null);
  }

  const apply = (r: SlopeResult) => {
    if (!r.ok) {
      setRefused(REFUSED[r.reason]);
      return;
    }
    setRefused(null);
    onFix(r.fix);
  };

  const commit = () => {
    const changed =
      text.low !== shown.low ||
      (input === 'points' ? text.high !== shown.high : text.pitch !== shown.pitch);
    if (!changed) {
      setRefused(null);
      return;
    }
    const low = parseLength(text.low, 'positive');
    if (!low.ok) {
      setRefused('office.review.slope_refused_height');
      return;
    }
    if (input === 'points') {
      const high = parseLength(text.high, 'positive');
      if (!high.ok) {
        setRefused('office.review.slope_refused_height');
        return;
      }
      apply(slopeByPoints(item, low.inches, high.inches));
      return;
    }
    const pitch = parsePitch(text.pitch);
    if (pitch === null) {
      setRefused('office.review.slope_refused_pitch');
      return;
    }
    apply(slopeByPitch(item, low.inches, pitch));
  };

  const read = () => {
    if (reading) return;
    setReading(true);
    setRefused(null);
    void readMesh()
      .then((c) => apply(slopeFromMesh(c)))
      .catch(() => setRefused('office.review.slope_read_failed'))
      .finally(() => setReading(false));
  };

  const field = (
    key: 'low' | 'high' | 'pitch',
    label: string,
    testId: string,
  ): ReactElement => (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        className={styles.typedInput}
        data-testid={testId}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text[key]}
        disabled={disabled}
        aria-invalid={refused !== null || undefined}
        onChange={(e) => setText((v) => ({ ...v, [key]: e.target.value }))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );

  return (
    <div data-testid="import-review-slope" data-input={fix?.input ?? 'none'}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('office.review.slope_set_by')}</span>
        <div className={styles.modes} role="group" aria-label={t('office.review.slope_set_by')}>
          {SLOPE_INPUTS.map((i) => (
            <button
              key={i}
              type="button"
              className={i === input ? `${styles.mode} ${styles.modeOn}` : styles.mode}
              aria-pressed={i === input}
              data-testid="import-review-slope-input"
              data-input={i}
              disabled={disabled}
              onClick={() => {
                setInput(i);
                setRefused(null);
                setText(shown);
              }}
            >
              {t(INPUT_LABEL[i])}
            </button>
          ))}
        </div>
      </div>
      {input === 'mesh' ? (
        <div className={styles.field}>
          <HeaderButton
            data-testid="import-review-slope-read"
            disabled={disabled || !hasMesh || reading}
            onClick={read}
          >
            {t(reading ? 'office.review.slope_reading' : 'office.review.slope_read')}
          </HeaderButton>
          {hasMesh ? null : (
            <p className={styles.muted} data-testid="import-review-slope-no-mesh">
              {t('office.review.slope_no_mesh')}
            </p>
          )}
        </div>
      ) : (
        <div className={styles.fieldPair}>
          {field(
            'low',
            t('office.review.slope_low', { side: t(SIDE_LABEL[item.lowSide]) }),
            'import-review-slope-low',
          )}
          {input === 'points'
            ? field(
                'high',
                t('office.review.slope_high', { side: t(SIDE_LABEL[item.highSide]) }),
                'import-review-slope-high',
              )
            : field('pitch', t('office.review.slope_pitch_field'), 'import-review-slope-pitch')}
        </div>
      )}
      {refused ? (
        <p className={styles.typedRefused} role="alert" data-testid="import-review-slope-refused">
          {t(refused)}
        </p>
      ) : null}
      <div className={styles.fieldPair}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('office.review.slope_now')}</span>
          <span className={styles.scanValue} data-testid="import-review-slope-now">
            {slopeText(item)}
          </span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('office.review.scan_reads')}</span>
          <span className={styles.scanValue} data-testid="import-review-scan">
            {slopeText(detected)}
          </span>
        </div>
      </div>
    </div>
  );
}
