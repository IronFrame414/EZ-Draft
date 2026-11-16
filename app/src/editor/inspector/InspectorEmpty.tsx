'use client';
// EZD-214 (11 Budgets): the empty inspector, shared by InspectorContent and the editor entry, which shows it until
// the lazy inspector panel is loaded (EZD-213b board: nothing selected).
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import styles from './InspectorPanel.module.css';

export function InspectorEmpty({ coarse }: { coarse: boolean }): ReactElement {
  const t = useT();
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="empty">
      <div className={styles.empty} data-testid="inspector-empty">
        <span className={styles.emptyIcon}>
          <Icon name="arrow_selector_tool" size={30} />
        </span>
        <span className={styles.emptyText}>{t('office.inspector.empty')}</span>
        <span className={styles.hint} data-testid="inspector-empty-hint">
          {t(coarse ? 'office.inspector.empty_hint_touch' : 'office.inspector.empty_hint')}
        </span>
      </div>
    </div>
  );
}
