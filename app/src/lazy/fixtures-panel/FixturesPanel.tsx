'use client';
// EZD-234 Build (S03 Fixtures "Opens fixture library ... click to place"; Q-0704 05-screens "The Fixtures panel (F)
// lists the fixtures and appliances in the fixture kind list. It has no Saved section"; Validation "Moving an
// appliance shows which utilities must move"; AC-EZD-234-1, -2; mockup S03Plan left card): the Fixtures panel over
// the canvas's left edge while the tool is on, and the utilities-to-move card after a move. Boards wait for Josh
// (Q-0705), so both follow the inspector's card style.
// EZD-226 Build (S03 Fixtures "custom tile showers with curb, niche, bench, glass, pan slope and drain type"; AC-EZD-226-1,
// -2; vault/build/assumptions.md EZD-226): a Custom tile showers section with its size, front, curb, niches (count and
// size), bench, glass (fixed panel or door with swing), drain and pan slope. Curb, niches, bench and glass are
// optional.
// EZD-227 Build (AC-EZD-227-1, -3; Q-0704; 09q Blocking; vault/build/assumptions.md EZD-227): a Grab-bar blocking
// section with its length and height to centre, both empty until typed (required, no default). A click on a wall
// places it on the side clicked.
// EZD-233 (R26 "Saved groups other than cabinets are placed from a Saved section in the Fixtures panel"; Q-0704 "EZD-233
// adds that"; AC-EZD-233-2; vault/build/assumptions.md EZD-233): a Saved section lists the company's saved groups;
// choosing one makes the next click place a copy of it.
import { useEffect, useState } from 'react';
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
import {
  blockingChoice,
  fixtureChoice,
  SHOWER_BENCH_START,
  SHOWER_GLASS_LENGTH_START,
  tileShowerChoice,
  utilityChoice,
  type FixtureChoice,
} from '../../editor/tools/fixture-tool';
import type { SavedGroupPayload } from '../../editor/edit/arrange-changes';
import styles from './FixturesPanel.module.css';

export type SavedGroupEntry = { id: string; name: string; data: SavedGroupPayload };

export type FixturesPanelProps = {
  choice: FixtureChoice;
  onChoose: (choice: FixtureChoice) => void;
  // Tests pass their own; the page reads /api/saved-groups.
  loadSavedGroups?: () => Promise<SavedGroupEntry[]>;
};

export async function fetchSavedGroups(): Promise<SavedGroupEntry[]> {
  const res = await fetch('/api/saved-groups', { cache: 'no-store' });
  if (!res.ok) throw new Error(`saved_groups_${res.status}`);
  const body = (await res.json()) as { groups: SavedGroupEntry[] };
  return body.groups;
}

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
  value: number | null;
  onValue: (inches: number | null) => void;
  testId: string;
}) {
  const [text, setText] = useState(() => (value === null ? '' : formatLength(value, 16)));
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

type SavedState =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; groups: SavedGroupEntry[] };

function SavedSection({
  choice,
  onChoose,
  load,
}: {
  choice: FixtureChoice;
  onChoose: (choice: FixtureChoice) => void;
  load: () => Promise<SavedGroupEntry[]>;
}) {
  const t = useT();
  const [state, setState] = useState<SavedState>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    load().then(
      (groups) => {
        if (live) setState({ kind: 'ready', groups });
      },
      () => {
        if (live) setState({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [load]);
  return (
    <div className={styles.section} data-testid="saved-groups-section">
      <h3 className={styles.title}>{t('office.saved_groups.section')}</h3>
      {state.kind === 'failed' ? (
        <p className={styles.hint} data-testid="saved-groups-failed">
          {t('office.saved_groups.load_failed')}
        </p>
      ) : state.kind === 'ready' && state.groups.length === 0 ? (
        <p className={styles.hint} data-testid="saved-groups-empty">
          {t('office.saved_groups.empty')}
        </p>
      ) : state.kind === 'ready' ? (
        <div className={styles.kinds}>
          {state.groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`${styles.kind} ${touch.hitArea}`}
              aria-pressed={choice.type === 'saved_group' && choice.id === g.id}
              data-testid="saved-group"
              data-group={g.id}
              onClick={() =>
                onChoose({ type: 'saved_group', id: g.id, name: g.name, payload: g.data })
              }
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FixturesPanel({
  choice,
  onChoose,
  loadSavedGroups = fetchSavedGroups,
}: FixturesPanelProps) {
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
      <div className={styles.section}>
        <h3 className={styles.title}>{t('office.fixtures.section_showers')}</h3>
        <div className={styles.kinds}>
          <button
            type="button"
            className={`${styles.kind} ${touch.hitArea}`}
            aria-pressed={choice.type === 'tile_shower'}
            data-testid="fixture-kind-tile_shower"
            onClick={() => onChoose(tileShowerChoice())}
          >
            {t('office.fixtures.tile_shower')}
          </button>
        </div>
      </div>
      <div className={styles.section}>
        <h3 className={styles.title}>{t('office.fixtures.section_blocking')}</h3>
        <div className={styles.kinds}>
          <button
            type="button"
            className={`${styles.kind} ${touch.hitArea}`}
            aria-pressed={choice.type === 'blocking'}
            data-testid="fixture-kind-blocking"
            onClick={() => onChoose(blockingChoice())}
          >
            {t('office.fixtures.blocking')}
          </button>
        </div>
      </div>
      {choice.type === 'blocking' ? (
        <div className={styles.section}>
          <div className={styles.row}>
            <LengthBox
              key="blocking-length"
              label={t('office.fixtures.blocking_length')}
              value={choice.length}
              testId="blocking-length"
              onValue={(v) => onChoose({ ...choice, length: v })}
            />
            <LengthBox
              key="blocking-height"
              label={t('office.fixtures.blocking_height')}
              value={choice.heightToCenter}
              testId="blocking-height"
              onValue={(v) => onChoose({ ...choice, heightToCenter: v })}
            />
          </div>
          <p className={styles.hint}>{t('office.fixtures.blocking_hint')}</p>
        </div>
      ) : choice.type === 'tile_shower' ? (
        <TileShowerFields choice={choice} onChoose={onChoose} />
      ) : choice.type === 'fixture' ? (
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
      ) : choice.type === 'utility' && choice.kind === 'electric' ? (
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
      <SavedSection choice={choice} onChoose={onChoose} load={loadSavedGroups} />
      <p className={styles.hint}>{t('office.fixtures.hint')}</p>
    </section>
  );
}

type TileShowerChoice = Extract<FixtureChoice, { type: 'tile_shower' }>;

// A size typed as 0, a negative or text reads as 0, which placing refuses (AC-EZD-226-2). An empty curb height is a
// curbless shower.
function TileShowerFields({
  choice,
  onChoose,
}: {
  choice: TileShowerChoice;
  onChoose: (choice: FixtureChoice) => void;
}) {
  const t = useT();
  const [curbWidth, setCurbWidth] = useState(choice.curb?.width ?? 4);
  return (
    <div className={styles.section} data-testid="tile-shower-fields">
      <div className={styles.row}>
        <LengthBox
          label={t('office.fixtures.width')}
          value={choice.width}
          testId="shower-width"
          onValue={(w) => onChoose({ ...choice, width: w ?? 0 })}
        />
        <LengthBox
          label={t('office.fixtures.depth')}
          value={choice.depth}
          testId="shower-depth"
          onValue={(d) => onChoose({ ...choice, depth: d ?? 0 })}
        />
      </div>
      <label className={styles.field}>
        <span className={styles.label}>{t('office.fixtures.facing')}</span>
        <select
          className={styles.input}
          data-testid="shower-facing"
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
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('office.fixtures.curb_height')}</span>
          <input
            className={styles.input}
            data-testid="shower-curb-height"
            defaultValue={choice.curb === null ? '' : formatLength(choice.curb.height, 16)}
            onChange={(e) => {
              const text = e.target.value.trim();
              if (text === '') return onChoose({ ...choice, curb: null });
              const r = parseLength(text, 'positive');
              onChoose({ ...choice, curb: { height: r.ok ? r.inches : 0, width: curbWidth } });
            }}
          />
        </label>
        <LengthBox
          label={t('office.fixtures.curb_width')}
          value={curbWidth}
          testId="shower-curb-width"
          onValue={(w) => {
            setCurbWidth(w ?? 0);
            if (choice.curb !== null)
              onChoose({ ...choice, curb: { ...choice.curb, width: w ?? 0 } });
          }}
        />
      </div>
      <p className={styles.hint}>{t('office.fixtures.curb_hint')}</p>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('office.fixtures.niches')}</span>
          <select
            className={styles.input}
            data-testid="shower-niches"
            value={choice.nicheCount}
            onChange={(e) => onChoose({ ...choice, nicheCount: Number(e.target.value) })}
          >
            {[0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('office.fixtures.drain')}</span>
          <select
            className={styles.input}
            data-testid="shower-drain"
            value={choice.drain}
            onChange={(e) =>
              onChoose({ ...choice, drain: e.target.value as TileShowerChoice['drain'] })
            }
          >
            <option value="center">{t('office.fixtures.drain.center')}</option>
            <option value="linear">{t('office.fixtures.drain.linear')}</option>
          </select>
        </label>
      </div>
      {choice.nicheCount > 0 ? (
        <div className={styles.row}>
          <LengthBox
            label={t('office.fixtures.niche_width')}
            value={choice.niche.width}
            testId="shower-niche-width"
            onValue={(v) => onChoose({ ...choice, niche: { ...choice.niche, width: v ?? 0 } })}
          />
          <LengthBox
            label={t('office.fixtures.niche_height')}
            value={choice.niche.height}
            testId="shower-niche-height"
            onValue={(v) => onChoose({ ...choice, niche: { ...choice.niche, height: v ?? 0 } })}
          />
          <LengthBox
            label={t('office.fixtures.niche_bottom')}
            value={choice.niche.bottomHeight}
            testId="shower-niche-bottom"
            onValue={(v) =>
              onChoose({ ...choice, niche: { ...choice.niche, bottomHeight: v ?? -1 } })
            }
          />
        </div>
      ) : null}
      <label className={styles.field}>
        <span className={styles.label}>{t('office.fixtures.bench')}</span>
        <select
          className={styles.input}
          data-testid="shower-bench"
          value={choice.bench === null ? 'none' : 'bench'}
          onChange={(e) =>
            onChoose({
              ...choice,
              bench: e.target.value === 'none' ? null : { ...SHOWER_BENCH_START },
            })
          }
        >
          <option value="none">{t('office.fixtures.none')}</option>
          <option value="bench">{t('office.fixtures.bench')}</option>
        </select>
      </label>
      {choice.bench !== null ? (
        <div className={styles.row}>
          {(['width', 'depth', 'height'] as const).map((k) => (
            <LengthBox
              key={k}
              label={t(`office.fixtures.${k}` as MessageKey)}
              value={choice.bench![k]}
              testId={`shower-bench-${k}`}
              onValue={(v) => onChoose({ ...choice, bench: { ...choice.bench!, [k]: v ?? 0 } })}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>{t('office.fixtures.glass')}</span>
          <select
            className={styles.input}
            data-testid="shower-glass"
            value={choice.glass === null ? 'none' : choice.glass.type}
            onChange={(e) => {
              const v = e.target.value;
              onChoose({
                ...choice,
                glass:
                  v === 'none'
                    ? null
                    : {
                        type: v as 'fixed' | 'door',
                        length: choice.glass?.length ?? SHOWER_GLASS_LENGTH_START,
                        swing: choice.glass?.swing ?? 'out',
                      },
              });
            }}
          >
            <option value="none">{t('office.fixtures.none')}</option>
            <option value="fixed">{t('office.fixtures.glass.fixed')}</option>
            <option value="door">{t('office.fixtures.glass.door')}</option>
          </select>
        </label>
        {choice.glass !== null ? (
          <LengthBox
            key={`g-${choice.glass.type}`}
            label={t('office.fixtures.glass_length')}
            value={choice.glass.length}
            testId="shower-glass-length"
            onValue={(v) => onChoose({ ...choice, glass: { ...choice.glass!, length: v ?? 0 } })}
          />
        ) : null}
        {choice.glass?.type === 'door' ? (
          <label className={styles.field}>
            <span className={styles.label}>{t('office.fixtures.swing')}</span>
            <select
              className={styles.input}
              data-testid="shower-glass-swing"
              value={choice.glass.swing}
              onChange={(e) =>
                onChoose({
                  ...choice,
                  glass: { ...choice.glass!, swing: e.target.value as 'in' | 'out' },
                })
              }
            >
              <option value="out">{t('office.fixtures.swing.out')}</option>
              <option value="in">{t('office.fixtures.swing.in')}</option>
            </select>
          </label>
        ) : null}
      </div>
      <LengthBox
        label={t('office.fixtures.pan_slope')}
        value={choice.panSlope}
        testId="shower-pan-slope"
        onValue={(s) => onChoose({ ...choice, panSlope: s ?? 0 })}
      />
    </div>
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
