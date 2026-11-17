'use client';
// EZD-233 (S03 Inspector "More (…) | Inspector footer | Menu: Copy, Mirror, Align, Group, Save as group, Delete"; Q-0630
// "More waits for EZD-233"): the inspector footer's More button, for an editor with something selected. It asks for the
// More menu under itself.
import { useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { Point } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { SelectionController } from '../selection/selection-controller';
import styles from './InspectorMore.module.css';

// EZD-233: the inspector with the More footer under it, in one scroll area.
export function InspectorStack({ children }: { children: ReactNode }): ReactElement {
  return <div className={styles.stack}>{children}</div>;
}

export function InspectorMore({
  selection,
  canEdit,
  onOpen,
}: {
  selection: Pick<SelectionController, 'getUi' | 'subscribe'>;
  canEdit: boolean;
  onOpen: (at: Point) => void;
}): ReactElement | null {
  const t = useT();
  const count = useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().ids.length,
    () => 0,
  );
  if (!canEdit || count === 0) return null;
  return (
    <div className={styles.footer}>
      <button
        type="button"
        className={styles.button}
        data-testid="inspector-more"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onOpen({ x: r.left, y: r.bottom + 4 });
        }}
      >
        <Icon name="more_horiz" size={18} />
        <span>{t('office.edit.more')}</span>
      </button>
    </div>
  );
}
