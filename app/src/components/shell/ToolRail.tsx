'use client';
// Tool rail: controlled, no state, CSS-only tooltip (vault/plans/EZD-012a.md Step 5; 04 Tool rail).
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import type { RailEntry, RailTool } from './rail-types';
import styles from './ToolRail.module.css';

export function ToolRail({
  top,
  bottom,
  activeId,
  onSelect,
}: {
  top: RailEntry[];
  bottom: RailTool[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const renderTool = (tool: RailTool) => (
    <div className={styles.slot} key={tool.id}>
      <button
        type="button"
        className={styles.tool}
        data-rail-tool={tool.id}
        aria-label={t(tool.label)}
        aria-keyshortcuts={tool.shortcut}
        aria-pressed={tool.id === activeId}
        onClick={() => onSelect(tool.id)}
      >
        <Icon name={tool.icon} size={21} />
      </button>
      <span className={styles.tip} data-rail-tooltip="" aria-hidden="true">
        {t(tool.label)}
        <kbd className={styles.key}>{tool.shortcut}</kbd>
      </span>
    </div>
  );
  return (
    <nav className={styles.rail} data-shell-region="rail" aria-label={t('office.shell.tools')}>
      <div className={`${styles.group} ${styles.top}`} data-rail="top">
        {top.map((entry, i) =>
          entry.kind === 'separator' ? (
            <span
              key={i}
              className={styles.separator}
              data-rail="separator"
              role="separator"
              aria-orientation="horizontal"
            />
          ) : (
            renderTool(entry)
          ),
        )}
      </div>
      <div className={styles.group} data-rail="bottom">
        {bottom.map(renderTool)}
      </div>
    </nav>
  );
}
