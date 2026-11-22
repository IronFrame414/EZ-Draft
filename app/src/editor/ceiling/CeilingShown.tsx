'use client';
// EZD-502 (S05 Layout "legend chip bottom left"; S05 Controls "Legend chip: shows switch zone line style"; S05 Layout
// "Status bar adds View, Scale and Joists status"; S05 States "Joists unknown"; board S05Ceiling footer "View Reflected
// ceiling plan", "Joists unknown · beam clash checks off"): the parts the editor shows on Ceiling or Both. The ACT
// border sizes join the legend with the ACT grid (EZD-511); the joist text changes with Framing known (EZD-514).
// EZD-508 (11 Budgets editor download size; 11 rule 7): moved from CeilingParts.tsx so they load with the RCP drawing
// (rcp.ts re-exports them); they show on Ceiling or Both only, as the drawing does.
import type { ReactElement } from 'react';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import styles from './CeilingParts.module.css';

export function CeilingLegend(): ReactElement {
  const t = useT();
  return (
    <div className={styles.legend} data-testid="ceiling-legend">
      <span className={styles.zone} data-legend="switch-zone" aria-hidden="true" />
      <span>{t('office.ceiling.legend.switch_zone')}</span>
    </div>
  );
}

export function CeilingViewStatus(): ReactElement {
  const t = useT();
  return (
    <StatusItem label="office.ceiling.status.view">
      <span data-testid="status-ceiling-view">{t('office.ceiling.status.rcp')}</span>
    </StatusItem>
  );
}

export function JoistsStatus(): ReactElement {
  const t = useT();
  return (
    <StatusItem label="office.ceiling.status.joists">
      <span data-testid="status-joists">{t('office.ceiling.status.joists_unknown')}</span>
    </StatusItem>
  );
}
