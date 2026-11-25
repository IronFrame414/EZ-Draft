'use client';
// EZD-502 (S05 Layout "legend chip bottom left"; S05 Controls "Legend chip: shows switch zone line style"; S05 Layout
// "Status bar adds View, Scale and Joists status"; S05 States "Joists unknown"; board S05Ceiling footer "View Reflected
// ceiling plan", "Joists unknown · beam clash checks off"): the parts the editor shows on Ceiling or Both. The ACT
// border sizes join the legend with the ACT grid (EZD-511); the joist text changes with Framing known (EZD-514).
// EZD-508 (11 Budgets editor download size; 11 rule 7): moved from CeilingParts.tsx so they load with the RCP drawing
// (rcp.ts re-exports them); they show on Ceiling or Both only, as the drawing does.
import type { ReactElement, ReactNode } from 'react';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import styles from './CeilingParts.module.css';

// EZD-511 (S05 Controls "Legend chip ... ACT border sizes for the selected grid"): `children` is the selected grid's
// border sizes (tools/ActGridPanel.tsx ActLegend), after the switch zone sample.
export function CeilingLegend({ children }: { children?: ReactNode } = {}): ReactElement {
  const t = useT();
  return (
    <div className={styles.legend} data-testid="ceiling-legend">
      <span className={styles.zone} data-legend="switch-zone" aria-hidden="true" />
      <span>{t('office.ceiling.legend.switch_zone')}</span>
      {children}
    </div>
  );
}

export function CeilingViewStatus(): ReactElement {
  const t = useT();
  const text = t('office.ceiling.status.rcp');
  // EZD-1981 (audit F5): may be cut with an ellipsis; the full text is the tooltip.
  return (
    <StatusItem label="office.ceiling.status.view" title={text}>
      <span data-testid="status-ceiling-view">{text}</span>
    </StatusItem>
  );
}

export function JoistsStatus(): ReactElement {
  const t = useT();
  const text = t('office.ceiling.status.joists_unknown');
  // EZD-1981 (audit F5): the longest ceiling cell; cut with an ellipsis when the bar runs out, full text as tooltip.
  return (
    <StatusItem label="office.ceiling.status.joists" title={text}>
      <span data-testid="status-joists">{text}</span>
    </StatusItem>
  );
}
