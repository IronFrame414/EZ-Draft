'use client';
// EZD-213b (boards S03dDoorSelected, S03dWindowSelected; D-Tiles, D-Length field, D-View only), EZD-214 (Status):
// the door and window inspector with its swing and hand tiles. EZD-1915: moved out of InspectorPanel.tsx unchanged.
import type { ReactElement } from 'react';
import { Icon } from '../../../components/icon/Icon';
import { useT } from '../../../lib/messages';
import type { InspectorEdit } from '../inspector-edits';
import type { DoorView, HingeLabel, InspectorView, SideLabel } from '../inspector-view';
import styles from '../InspectorPanel.module.css';
import {
  ControlErrorLine,
  Header,
  ImpactSection,
  RoughOpeningSection,
  SEPARATOR,
  StatusSection,
  TextBox,
  lengthText,
  one,
  useControlCommit,
  type ControlError,
  type TFn,
} from './SharedFields';
import type { InspectorContentProps } from './types';

type OpeningView = Extract<InspectorView, { kind: 'opening' }>;

function sideText(t: TFn, l: SideLabel): string {
  if (l.kind === 'room') return t('office.inspector.side.room', { name: l.name });
  if (l.kind === 'outside') return t('office.inspector.side.outside');
  return t(`office.inspector.side.${l.direction}`);
}

function opensText(t: TFn, l: SideLabel): string {
  if (l.kind === 'room') return t('office.inspector.opens.room', { name: l.name });
  if (l.kind === 'outside') return t('office.inspector.opens.outside');
  return t(`office.inspector.opens.${l.direction}`);
}

const hingeOn = (t: TFn, h: HingeLabel) => t(`office.inspector.hinge_on.${h}`);

function wallTitle(t: TFn, number: number | null): string {
  return number === null
    ? t('office.conflicts.object.wall_unnumbered')
    : t('office.conflicts.object.wall', { number });
}

// ---- Door and window (boards D, N, S) ----

const TILES: Record<'left' | 'right', Record<'left' | 'right', ReactElement>> = {
  left: {
    left: (
      <svg viewBox="-4 -14 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="18" y1="30" x2="18" y2="-10" className={styles.tileLeaf} />
        <path d="M58 30 A40 40 0 0 0 18 -10" className={styles.tileArc} />
        <circle cx="18" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
    right: (
      <svg viewBox="-4 -14 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="58" y1="30" x2="58" y2="-10" className={styles.tileLeaf} />
        <path d="M18 30 A40 40 0 0 1 58 -10" className={styles.tileArc} />
        <circle cx="58" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
  },
  right: {
    left: (
      <svg viewBox="-4 26 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="18" y1="38" x2="18" y2="78" className={styles.tileLeaf} />
        <path d="M58 38 A40 40 0 0 1 18 78" className={styles.tileArc} />
        <circle cx="18" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
    right: (
      <svg viewBox="-4 26 84 56" width="84" height="56" aria-hidden="true">
        <line x1="-4" y1="34" x2="18" y2="34" className={styles.tileWall} />
        <line x1="58" y1="34" x2="80" y2="34" className={styles.tileWall} />
        <line x1="58" y1="38" x2="58" y2="78" className={styles.tileLeaf} />
        <path d="M18 38 A40 40 0 0 0 58 78" className={styles.tileArc} />
        <circle cx="58" cy="34" r="3.5" className={styles.tileDot} />
      </svg>
    ),
  },
};

const SIDES = ['left', 'right'] as const;

function SwingSection({
  door,
  canEdit,
  commit,
  error,
}: {
  door: DoorView;
  canEdit: boolean;
  commit: (testId: string, edits: readonly InspectorEdit[]) => void;
  error: ControlError;
}) {
  const t = useT();
  const result = t('office.inspector.door_result', {
    opens: opensText(t, door.result.opensInto),
    hinge: hingeOn(t, door.result.hinge),
  });
  const resultLine = (
    <span className={styles.result} data-testid="inspector-door-result">
      {result}
    </span>
  );
  if (!canEdit) {
    return (
      <div className={styles.section}>
        <span className={styles.head}>{t('office.inspector.field.swing_hand')}</span>
        {resultLine}
      </div>
    );
  }
  const press = (s: 'left' | 'right', h: 'left' | 'right') => {
    const edits: InspectorEdit[] = [];
    if (s !== door.swing) edits.push({ field: 'swing', value: s });
    if (h !== door.hand) edits.push({ field: 'hand', value: h });
    if (edits.length === 0) return;
    commit('inspector-swing-hand', edits);
  };
  return (
    <div className={styles.section}>
      <span className={styles.head}>{t('office.inspector.field.swing_hand')}</span>
      <div
        className={styles.swing}
        role="radiogroup"
        aria-label={t('office.inspector.field.swing_hand')}
        data-testid="inspector-swing-hand"
      >
        <span />
        {SIDES.map((h) => (
          <span
            key={h}
            className={`${styles.hint} ${styles.center}`}
            data-testid={`inspector-hinge-${h}`}
          >
            {t(`office.inspector.hinge.${door.hingeLabels[h]}`)}
          </span>
        ))}
        {SIDES.map((s) => [
          <span key={`side-${s}`} className={styles.hint} data-testid={`inspector-swing-${s}`}>
            {sideText(t, door.swingLabels[s])}
          </span>,
          ...SIDES.map((h) => (
            <button
              key={`${s}-${h}`}
              type="button"
              role="radio"
              className={styles.tile}
              aria-checked={door.swing === s && door.hand === h}
              aria-label={t('office.inspector.door_tile', {
                opens: opensText(t, door.swingLabels[s]),
                hinge: hingeOn(t, door.hingeLabels[h]),
              })}
              data-testid={`inspector-tile-${s}-${h}`}
              onClick={() => press(s, h)}
            >
              {TILES[s][h]}
            </button>
          )),
        ])}
      </div>
      <ControlErrorLine error={error} testId="inspector-swing-hand" />
      {resultLine}
      <span className={styles.hint} data-testid="inspector-door-hint">
        {t('office.inspector.door_hint')}
      </span>
    </div>
  );
}

export function OpeningPanel(props: InspectorContentProps & { view: OpeningView }) {
  const { view, canEdit, onCommit } = props;
  const t = useT();
  const f = view.fields;
  const { error, commit } = useControlCommit(onCommit);
  const number = view.number;
  const title =
    number === null
      ? t(`office.conflicts.object.${view.openingKind}_unnumbered`)
      : t(`office.conflicts.object.${view.openingKind}`, { number });
  const subtitle =
    view.host === null
      ? t('office.inspector.not_on_wall')
      : [...view.rooms, wallTitle(t, view.host.number)].join(SEPARATOR);
  const flagged = view.host === null;
  const ro = t('office.inspector.rough_opening_value', {
    width: f.roughOpening.width,
    height: f.roughOpening.height,
  });

  return (
    <div
      className={styles.panel}
      data-testid="inspector"
      data-inspector-kind="opening"
      data-opening-kind={view.openingKind}
    >
      <Header title={title} subtitle={subtitle} canEdit={canEdit} />
      {flagged ? (
        <div className={styles.flag} data-testid="inspector-not-on-wall">
          <span className={styles.flagTitle}>
            <Icon name="error" size={18} />
            {t('office.inspector.not_on_wall')}
          </span>
          {canEdit ? (
            <span className={`${styles.hint} ${styles.flagHint}`}>
              {t('office.inspector.not_on_wall_hint')}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={`${styles.section} ${styles.first} ${flagged ? '' : styles.flush}`}>
        <span className={styles.head}>{t('office.inspector.field.size')}</span>
        <div className={styles.pair}>
          <TextBox
            testId="inspector-width"
            label={t('office.inspector.field.width')}
            shared={one(f.width)}
            canEdit={canEdit}
            onText={lengthText('openingWidth', onCommit)}
          />
          <TextBox
            testId="inspector-opening-height"
            label={t('office.inspector.field.height')}
            shared={one(f.height)}
            canEdit={canEdit}
            onText={lengthText('openingHeight', onCommit)}
          />
        </div>
      </div>
      {view.door !== null ? (
        <SwingSection door={view.door} canEdit={canEdit} commit={commit} error={error} />
      ) : null}
      {view.offset !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-offset"
            label={t('office.inspector.field.offset')}
            shared={one(view.offset.left)}
            canEdit={canEdit}
            onText={lengthText('offsetLeft', onCommit)}
            head
          />
          <span className={styles.hint} data-testid="inspector-offset-caption">
            {view.offset.cornerWall === null
              ? t('office.inspector.offset.free_end')
              : view.offset.cornerWall.number === null
                ? t('office.inspector.offset.corner_unnumbered')
                : t('office.inspector.offset.corner', { number: view.offset.cornerWall.number })}
          </span>
        </div>
      ) : null}
      {f.sillHeight !== null ? (
        <div className={styles.section}>
          <TextBox
            testId="inspector-sill"
            label={t('office.inspector.field.sill')}
            shared={one(f.sillHeight)}
            canEdit={canEdit}
            onText={lengthText('sillHeight', onCommit)}
            head
          />
        </div>
      ) : null}
      <RoughOpeningSection
        shared={one(ro)}
        auto={f.roughOpeningAuto}
        canEdit={canEdit}
        onCommit={onCommit}
      />
      <ImpactSection
        impact={one(f.impactRating)}
        shutter={one(f.shutterType)}
        canEdit={canEdit}
        commit={commit}
        error={error}
      />
      <StatusSection status={one(f.status)} canEdit={canEdit} commit={commit} error={error} />
    </div>
  );
}
