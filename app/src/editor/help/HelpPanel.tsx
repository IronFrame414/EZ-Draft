'use client';
// EZD-222 (S03 Help "Opens help and shortcut list"; 04 Tool rail "Help | ? | Shortcuts and help"; phase-02.md
// EZD-222 "Help lists shortcuts"): the Help panel. It lists every command with the company's key ("Not set" for a
// cleared row) and says where keys are changed. Esc, the close button or a click outside closes it.
import { useEffect, useRef } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { SHORTCUT_COMMANDS, keyLabel, type ShortcutBindings } from '../../lib/defaults/shortcuts';
import styles from './HelpPanel.module.css';

export function HelpPanel({ bindings, onClose }: { bindings: ShortcutBindings; onClose: () => void }) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className={styles.backdrop}
      data-testid="help-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="help-title" className={styles.panel} data-testid="help-panel">
        <div className={styles.head}>
          <h2 id="help-title">{t('office.help.title')}</h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={t('office.help.close')}
            data-testid="help-close"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <h3 className={styles.sub}>{t('office.help.shortcuts')}</h3>
        <dl className={styles.list} data-testid="help-shortcuts">
          {SHORTCUT_COMMANDS.map((c) => (
            <div key={c.id} className={styles.item} data-testid="help-shortcut" data-command={c.id}>
              <dt>{t(c.label)}</dt>
              <dd>{bindings[c.id] ? keyLabel(bindings[c.id]) : t('office.defaults.not_set')}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.note}>{t('office.help.settings_note')}</p>
      </div>
    </div>
  );
}
