'use client';
// The Resolve the gap section of the inspector (EZD-213c D-Markup; vault/plans/EZD-213c.md; Q-0570: no buttons
// without Edit model; Q-0633 G9: the tablet hint). A pure component.
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { GapBox } from '../tools/gap';
import styles from './ResolveGap.module.css';

export type ResolveGapProps = {
  box: GapBox;
  picking: boolean;
  alert: MessageKey | null;
  coarse: boolean;
  onPick: () => void;
  onKeep: () => void;
};

export function ResolveGap({
  box,
  picking,
  alert,
  coarse,
  onPick,
  onKeep,
}: ResolveGapProps): ReactElement {
  const t = useT();
  const act = box.actions.length > 0;
  return (
    <section
      className={styles.section}
      data-testid="inspector-gap"
      data-pick={picking ? 'true' : 'false'}
    >
      {act ? (
        <span className={styles.title} data-testid="gap-title">
          {t('office.tools.gap.title')}
        </span>
      ) : null}
      <p className={styles.size} data-testid="gap-size">
        <span className={styles.sizeIcon}>
          <Icon name="error" size={18} />
        </span>
        <span>{t('office.tools.gap.size', { size: box.sizeText })}</span>
      </p>
      {act ? (
        picking ? (
          <p className={styles.hint} data-testid="gap-hint">
            {t(coarse ? 'office.tools.gap.pick_hint_touch' : 'office.tools.gap.pick_hint')}
          </p>
        ) : (
          <>
            {box.actions.includes('absorb') ? (
              <StateButton className={styles.action} data-testid="gap-pick" onClick={onPick}>
                <Icon name="ads_click" size={18} />
                {t('office.tools.gap.pick')}
              </StateButton>
            ) : null}
            {box.actions.includes('keep') ? (
              <StateButton className={styles.action} data-testid="gap-keep" onClick={onKeep}>
                <Icon name="rotate_right" size={18} />
                {t('office.tools.gap.keep')}
              </StateButton>
            ) : null}
            {box.note !== null ? (
              <p className={styles.note} data-testid="gap-note">
                {t(box.note)}
              </p>
            ) : null}
          </>
        )
      ) : null}
      {act && alert !== null ? (
        <p className={styles.alert} data-testid="gap-alert" role="alert">
          {t(alert)}
        </p>
      ) : null}
    </section>
  );
}
