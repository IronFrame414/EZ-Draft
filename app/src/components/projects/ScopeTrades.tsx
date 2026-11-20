// EZD-739 (Q-0764; Q-0779; S01 Step 1): the four scope tick boxes, Electrical, Plumbing, Mechanical and
// Reflected ceiling plan, under Scope of work in the New project wizard and Project settings. Project settings
// shows the ticked ones as text instead to a member who may not change the scope text.
import type { ReactElement } from 'react';
import { useT } from '../../lib/messages';
import { SCOPE_TRADES, toggleScopeTrade, type ScopeTrade } from '../../lib/projects/new-project';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { Icon } from '../icon/Icon';
import styles from './ScopeTrades.module.css';

export const SCOPE_TRADE_LABELS: Record<ScopeTrade, MessageKey> = {
  electrical: 'office.scope_trades.electrical',
  plumbing: 'office.scope_trades.plumbing',
  mechanical: 'office.scope_trades.mechanical',
  rcp: 'office.scope_trades.rcp',
};

export function ScopeTrades({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: readonly ScopeTrade[];
  onChange: (next: ScopeTrade[]) => void;
}): ReactElement {
  const t = useT();
  return (
    <div
      className={styles.group}
      role="group"
      aria-label={t('office.new_project.scope')}
      data-testid={`${idPrefix}-scope-trades`}
    >
      {SCOPE_TRADES.map((trade) => {
        const ticked = value.includes(trade);
        return (
          <label key={trade} className={`${styles.option} ${touch.target}`}>
            {/* The checkbox covers the whole label, so the tap area is the label (44 px on touch). */}
            <input
              type="checkbox"
              className={styles.checkInput}
              data-testid={`${idPrefix}-scope-trade`}
              data-trade={trade}
              checked={ticked}
              onChange={(e) => onChange(toggleScopeTrade(value, trade, e.target.checked))}
            />
            <span className={styles.check} aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
            {t(SCOPE_TRADE_LABELS[trade])}
          </label>
        );
      })}
    </div>
  );
}
