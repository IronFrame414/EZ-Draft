'use client';
// EZD-612 (S06 Check status pill: "Shows result of the last check. Click opens the check results list. Green when no
// open warnings; amber with count when warnings exist; grey 'Check not run' after changes since the last check";
// board S06Electrical "Last check 10:41 AM · 1 warning"): the pill on the canvas.
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import { checkTime, pillState, type CodeCheckRun } from './check-status';
import styles from './CheckPill.module.css';

export function CheckPill({
  run,
  changedSinceRun,
  onOpen,
}: {
  run: CodeCheckRun | null;
  changedSinceRun: boolean;
  onOpen: () => void;
}): ReactElement {
  const t = useT();
  const s = pillState(run, changedSinceRun);
  const text =
    s.kind === 'not_run'
      ? t('office.check.pill.not_run')
      : s.kind === 'pass'
        ? t('office.check.pill.pass', { time: checkTime(s.at) })
        : t('office.check.pill.warnings', { time: checkTime(s.at), count: s.count });
  return (
    <button
      type="button"
      className={`${styles.pill} ${styles[s.kind]} ${touch.target}`}
      data-testid="check-pill"
      data-state={s.kind}
      onClick={onOpen}
    >
      <Icon name="rule" size={16} />
      <span>{text}</span>
    </button>
  );
}
