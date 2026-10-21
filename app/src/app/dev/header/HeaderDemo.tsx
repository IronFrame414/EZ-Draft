'use client';

import { useCallback, useMemo, useState } from 'react';
import { useT } from '../../../lib/messages';
import { EditorHeader, HeaderButton } from '../../../components/shell';
import type { EditorView } from '../../../components/shell';
import styles from './page.module.css';

const SUBTITLE = ['Sample client', 'Working copy', 'Saved just now'] as const;

export function HeaderDemo() {
  const t = useT();
  const [activeView, setActiveView] = useState<EditorView>('plan');
  const [projectMenuCount, setProjectMenuCount] = useState(0);
  const onViewChange = useCallback((view: EditorView) => setActiveView(view), []);
  const onProjectMenu = useCallback(() => setProjectMenuCount((n) => n + 1), []);
  const share = useMemo(() => <HeaderButton>{t('office.header.share')}</HeaderButton>, [t]);
  const exportSlot = useMemo(() => <HeaderButton>{t('office.header.export')}</HeaderButton>, [t]);
  const issueSet = useMemo(
    () => <HeaderButton variant="primary">{t('office.header.issue_set')}</HeaderButton>,
    [t],
  );
  return (
    <div
      className={styles.frame}
      data-testid="header-demo"
      data-project-menu-count={String(projectMenuCount)}
    >
      <EditorHeader
        projectsHref="/"
        projectName="Sample project"
        onProjectMenu={onProjectMenu}
        subtitle={SUBTITLE}
        activeView={activeView}
        onViewChange={onViewChange}
        share={share}
        export={exportSlot}
        issueSet={issueSet}
      />
    </div>
  );
}
