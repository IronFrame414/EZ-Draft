'use client';
// EZD-234 Build (S03 Fixtures "Opens fixture library ... click to place"; Q-0704 05-screens "The Fixtures panel (F)
// lists the fixtures and appliances in the fixture kind list. It has no Saved section"; Validation "Moving an
// appliance shows which utilities must move"; AC-EZD-234-1, -2; mockup S03Plan left card): the Fixtures panel over
// the canvas's left edge while the tool is on, and the utilities-to-move card after a move. Boards wait for Josh
// (Q-0705), so both follow the inspector's card style.
import { useState } from 'react';
import {
  FIXTURE_KINDS,
  UTILITY_KINDS,
  formatChipDistance,
  formatLength,
  parseLength,
  type UtilityKind,
} from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { UtilitiesMoved } from '../../editor/tools/drawing-controller';
import { FIXTURE_FACINGS, type FixtureFacing } from '../../editor/tools/fixture-geometry';
import { fixtureChoice, utilityChoice, type FixtureChoice } from '../../editor/tools/fixture-tool';
import styles from './FixturesPanel.module.css';

export type FixturesPanelProps = {
  choice: FixtureChoice;
  onChoose: (choice: FixtureChoice) => void;
};

const kindKey = (kind: string) => `office.fixtures.kind.${kind}` as MessageKey;
const utilityKey = (kind: UtilityKind) => `office.fixtures.utility.${kind}` as MessageKey;
const facingKey = (f: FixtureFacing) => `office.fixtures.facing.${f}` as MessageKey;

// A length box that keeps what is typed and reports a parsed positive length, or null for anything else. It is keyed
// by the fixture kind, so choosing another kind starts it again at that kind's size.
function LengthBox({
  label,
  value,
  onValue,
  testId,
}: {
  label: string;
  value: number;
  onValue: (inches: number | null) => void;
  testId: string;
}) {
  const [text, setText] = useState(() => formatLength(value, 16));
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        data-testid={testId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const r = parseLength(e.target.value, 'positive');
          onValue(r.ok ? r.inches : null);
        }}
      />
    </label>
  );
}

export function FixturesPanel({ choice, onChoose }: FixturesPanelProps) {
  const t = useT();
  return (
    <section
      className={styles.panel}
      data-testid="fixtures-panel"
      aria-label={t('office.fixtures.title')}
    >
      <h2 className={styles.heading}>{t('office.fixtures.title')}</h2>
      <div className={styles.section}>
        <h3 className={styles.title}>{t('office.fixtures.section_fixtures')}</h3>
        <div className={styles.kinds}>
          {FIXTURE_KINDS.map((kind) => {
            const on = choice.type === 'fixture' && choice.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`${styles.kind} ${touch.hitArea}`}
                aria-pressed={on}
                data-testid={`fixture-kind-${kind}`}
                onClick={() => onChoose(fixtureChoice(kind))}
              >
                {t(kindKey(kind))}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.section}>
        <h3 className={styles.title}>{t('office.fixtures.section_utilities')}</h3>
        <div className={styles.kinds}>
          {UTILITY_KINDS.map((kind) => {
            const on = choice.type === 'utility' && choice.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`${styles.kind} ${touch.hitArea}`}
                aria-pressed={on}
                data-testid={`utility-kind-${kind}`}
                onClick={() => onChoose(utilityChoice(kind))}
              >
                {t(utilityKey(kind))}
              </button>
            );
          })}
        </div>
      </div>
      {choice.type === 'fixture' ? (
        <div className={styles.section}>
          <div className={styles.row}>
            <LengthBox
              key={`w-${choice.kind}`}
              label={t('office.fixtures.width')}
              value={choice.width}
              testId="fixture-width"
              onValue={(w) => onChoose({ ...choice, width: w ?? 0 })}
            />
            <LengthBox
              key={`d-${choice.kind}`}
              label={t('office.fixtures.depth')}
              value={choice.depth}
              testId="fixture-depth"
              onValue={(d) => onChoose({ ...choice, depth: d ?? 0 })}
            />
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t('office.fixtures.facing')}</span>
            <select
              className={styles.input}
              data-testid="fixture-facing"
              value={choice.facing}
              onChange={(e) => onChoose({ ...choice, facing: e.target.value as FixtureFacing })}
            >
              {FIXTURE_FACINGS.map((f) => (
                <option key={f} value={f}>
                  {t(facingKey(f))}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : choice.kind === 'electric' ? (
        <div className={styles.section}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>{t('office.fixtures.volts')}</span>
              <select
                className={styles.input}
                data-testid="utility-volts"
                value={choice.volts}
                onChange={(e) =>
                  onChoose({ ...choice, volts: Number(e.target.value) as 120 | 240 })
                }
              >
                <option value={120}>120</option>
                <option value={240}>240</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('office.fixtures.amps')}</span>
              <input
                key={`a-${choice.kind}`}
                className={styles.input}
                data-testid="utility-amps"
                inputMode="decimal"
                defaultValue={String(choice.amps)}
                onChange={(e) => {
                  const n = Number(e.target.value.trim());
                  onChoose({
                    ...choice,
                    amps: e.target.value.trim() !== '' && Number.isFinite(n) ? n : 0,
                  });
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
      <p className={styles.hint}>{t('office.fixtures.hint')}</p>
    </section>
  );
}

export type UtilitiesToMoveProps = {
  moved: readonly UtilitiesMoved[];
  onClose: () => void;
};

// S03 Validation: informs only; it blocks nothing.
export function UtilitiesToMove({ moved, onClose }: UtilitiesToMoveProps) {
  const t = useT();
  return (
    <section className={styles.utilities} data-testid="utilities-to-move" aria-live="polite">
      <h2 className={styles.heading}>{t('office.fixtures.move_title')}</h2>
      <ul className={styles.list}>
        {moved.flatMap((m) =>
          m.utilities.map((u) => (
            <li key={u.pointId} data-testid="utility-to-move" data-point={u.pointId}>
              {t('office.fixtures.move_row', {
                kind: t(utilityKey(u.kind)),
                distance: formatChipDistance(u.distance),
              })}
            </li>
          )),
        )}
      </ul>
      <button type="button" className={`${styles.close} ${touch.hitArea}`} onClick={onClose}>
        {t('office.fixtures.move_close')}
      </button>
    </section>
  );
}
