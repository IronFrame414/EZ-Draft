'use client';
// Editor frame: header slot, body (rail, left panel, canvas, inspector), status bar
// (vault/plans/EZD-012b.md Step 1; 04 Frame and visual system).
import type { ReactNode } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './EditorFrame.module.css';

export type EditorFrameProps = {
  header?: ReactNode;
  rail: ReactNode;
  leftPanel?: ReactNode;
  leftPanelLabel: MessageKey;
  canvas?: ReactNode;
  inspector?: ReactNode;
  inspectorLabel: MessageKey;
  statusBar: ReactNode;
};

export function EditorFrame({
  header,
  rail,
  leftPanel,
  leftPanelLabel,
  canvas,
  inspector,
  inspectorLabel,
  statusBar,
}: EditorFrameProps) {
  const t = useT();
  return (
    <div className={styles.frame} data-shell-region="frame">
      {header}
      <div className={styles.body} data-shell-region="body">
        {rail}
        <aside
          className={styles.leftPanel}
          data-shell-region="left-panel"
          aria-label={t(leftPanelLabel)}
        >
          {leftPanel}
        </aside>
        <main className={styles.canvas} data-shell-region="canvas">
          {canvas}
        </main>
        <aside
          className={styles.inspector}
          data-shell-region="inspector"
          aria-label={t(inspectorLabel)}
        >
          {inspector}
        </aside>
      </div>
      {statusBar}
    </div>
  );
}
