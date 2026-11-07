'use client';
// Gap boxes (EZD-210b; vault/plans/EZD-210b.md section 3 C13, Decided "Gap box", "Touch"; S02B :71, :96-100;
// Q-0569; Q-0570): the red gap pill near each gap and, for an editor, the Resolve the gap panel with its buttons,
// the pick hint and the refusal. Placed by DrawingLayer through `boxRef`.
import { Icon } from '../../components/icon/Icon';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import type { DrawingUi } from './drawing-controller';
import type { GapBox, PickState } from './gap';
import styles from './DrawingTools.module.css';

export type GapBoxesProps = {
  boxes: readonly GapBox[];
  pick: PickState;
  message: DrawingUi['gapMessage'];
  onPick: (box: GapBox) => void;
  onKeep: (box: GapBox) => void;
  boxRef: (key: string, el: HTMLDivElement | null) => void;
};

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function GapBoxes({ boxes, pick, message, onPick, onKeep, boxRef }: GapBoxesProps) {
  const t = useT();
  return (
    <>
      {boxes.map((box) => {
        const key = box.wallIds.join(',');
        const picking = pick !== null && sameIds(pick.gapWallIds, box.wallIds);
        const alert =
          message !== null && sameIds(message.wallIds, box.wallIds) ? message.key : null;
        return (
          <div
            key={key}
            ref={(el) => boxRef(key, el)}
            className={styles.box}
            data-testid="gap-box"
            data-gap-walls={key}
            data-pick={picking ? 'true' : 'false'}
          >
            <span className={styles.pill} data-testid="gap-pill">
              {t('office.tools.gap.size', { size: box.sizeText })}
            </span>
            {box.actions.length > 0 ? (
              <div className={styles.panel}>
                {picking ? (
                  <p className={styles.hint} data-testid="gap-hint">
                    {t('office.tools.gap.pick_hint')}
                  </p>
                ) : (
                  <>
                    <span className={styles.title} data-testid="gap-title">
                      {t('office.tools.gap.title')}
                    </span>
                    {box.actions.includes('absorb') ? (
                      <StateButton
                        className={styles.action}
                        data-testid="gap-pick"
                        onClick={() => onPick(box)}
                      >
                        <Icon name="ads_click" size={18} />
                        {t('office.tools.gap.pick')}
                      </StateButton>
                    ) : null}
                    {box.actions.includes('keep') ? (
                      <StateButton
                        className={styles.action}
                        data-testid="gap-keep"
                        onClick={() => onKeep(box)}
                      >
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
                )}
                {alert !== null ? (
                  <p className={styles.alert} data-testid="gap-alert" role="alert">
                    {t(alert)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
