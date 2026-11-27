'use client';
// Editor frame: header slot, body (rail, left panel, canvas, inspector), status bar
// (vault/plans/EZD-012b.md Step 1; 04 Frame and visual system).
// EZD-120c Build step 1 (vault/plans/EZD-120c.md): each <aside> renders only when its label is given.
// EZD-207a Build step 13 (vault/plans/EZD-207a.md C6): `backdrop` fills the frame behind every card.
// EZD-2029 (Q-0909; AC-EZD-2029-1..4): on a touch screen (a coarse pointer) the left panel starts folded and one
// control below the rail opens it over the canvas and folds it again (or Esc). The fold is CSS
// (EditorFrame.module.css), so with a mouse the control is not shown and the frame is as before.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import styles from './EditorFrame.module.css';

export type EditorFrameProps = {
  header?: ReactNode;
  rail: ReactNode;
  leftPanel?: ReactNode;
  leftPanelLabel?: MessageKey;
  canvas?: ReactNode;
  inspector?: ReactNode;
  inspectorLabel?: MessageKey;
  statusBar: ReactNode;
  backdrop?: ReactNode;
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
  backdrop,
}: EditorFrameProps) {
  const t = useT();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fold = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    // Esc folds the panel only; the editor's own Esc (clear selection, cancel a tool) does not also run.
    e.stopPropagation();
    setOpen(false);
    toggleRef.current?.focus();
  };
  const toggleName = t('common.shell.left_panel_toggle');
  return (
    <div
      className={styles.frame}
      data-shell-region="frame"
      data-backdrop={backdrop === undefined ? undefined : ''}
    >
      {backdrop === undefined ? null : (
        <div className={styles.backdrop} data-shell-region="backdrop">
          {backdrop}
        </div>
      )}
      {header}
      <div className={styles.body} data-shell-region="body">
        {/* With a mouse the column takes no box (display: contents), so rail, panel and canvas sit in the body as
            before; on a touch screen it is the rail's column and the open panel is placed from it. It is always
            there, so the rail is not remounted when a left panel comes or goes (EZD-1986). */}
        <div className={styles.railColumn}>
          {rail}
          {leftPanelLabel ? (
            <>
              <button
                ref={toggleRef}
                type="button"
                className={`${styles.foldToggle} ${touch.target}`}
                data-testid="left-panel-toggle"
                aria-label={toggleName}
                title={toggleName}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={fold}
              >
                <Icon name={open ? 'chevron_left' : 'chevron_right'} size={21} />
              </button>
              <aside
                id={panelId}
                className={styles.leftPanel}
                data-shell-region="left-panel"
                data-open={open ? '' : undefined}
                aria-label={t(leftPanelLabel)}
                onKeyDown={fold}
              >
                {leftPanel}
              </aside>
            </>
          ) : null}
        </div>
        <main className={styles.canvas} data-shell-region="canvas">
          {canvas}
        </main>
        {inspectorLabel ? (
          <aside
            className={styles.inspector}
            data-shell-region="inspector"
            aria-label={t(inspectorLabel)}
          >
            {inspector}
          </aside>
        ) : null}
      </div>
      {statusBar}
    </div>
  );
}
