'use client';
// EZD-117b Build step 11 (vault/plans/EZD-117b.md Decided "Header markup", "Settings gear rule", "/ key", "Esc";
// section 3; S01 Controls; Q-0401; Q-0403): the Projects page header. Wordmark, title, the search field with the
// "/" shortcut and Esc to clear, the notifications bell, the settings gear (only to a user who may open Settings)
// and the avatar menu. No EZ Binder link (Q-0401). Without `search` (no View projects) the search field, the bell
// and the key listener are absent.
import Link from 'next/link';
import { useEffect, useRef, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import { AvatarMenu } from '../account/AvatarMenu';
import { Icon } from '../icon/Icon';
import { NotificationBell } from '../notifications/NotificationBell';
import styles from './Projects.module.css';

export type ProjectsAccount = {
  initials: string;
  name: string | null;
  email: string;
  showSettings: boolean;
};

export type ProjectsSearchProps = {
  query: string;
  onQuery(text: string): void;
  onClear(): void;
};

export type ProjectsHeaderProps = {
  account: ProjectsAccount;
  search: ProjectsSearchProps | null;
};

// Input types that take no typed text: "/" still focuses the search from them.
const NON_TEXT_INPUT_TYPES = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
];

function isTextEntry(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const t = target as { isContentEditable?: unknown; tagName?: unknown; type?: unknown };
  if (t.isContentEditable === true) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.includes(String(t.type));
  return false;
}

export function isSearchShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  target: unknown;
}): boolean {
  return (
    e.key === '/' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.defaultPrevented &&
    !e.isComposing &&
    !isTextEntry(e.target)
  );
}

function SearchField({ query, onQuery, onClear }: ProjectsSearchProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e)) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <label className={styles.search}>
      <Icon name="search" size={20} />
      <input
        ref={input}
        className={styles.searchInput}
        data-testid="projects-search"
        type="text"
        aria-label={t('office.projects.search_label')}
        placeholder={t('office.projects.search_placeholder')}
        aria-keyshortcuts="/"
        maxLength={1000}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || query === '') return;
          e.preventDefault();
          onClear();
        }}
      />
      <span className={styles.chip} data-testid="projects-search-hint" aria-hidden="true">
        /
      </span>
    </label>
  );
}

export function ProjectsHeader({ account, search }: ProjectsHeaderProps): ReactElement {
  const t = useT();
  return (
    <header className={`${styles.card} ${styles.header}`} data-testid="projects-header">
      <span className={styles.wordmark} data-testid="projects-wordmark">
        <span>{t('office.header.wordmark_ez')}</span>
        <span className={styles.accent}>{t('office.header.wordmark_draft')}</span>
      </span>
      <span aria-hidden="true" className={styles.divider} />
      <span className={styles.headTitle} data-testid="projects-header-title">
        {t('office.projects.title')}
      </span>
      <span className={styles.spacer} />
      {search !== null ? (
        <>
          <SearchField query={search.query} onQuery={search.onQuery} onClear={search.onClear} />
          <NotificationBell />
        </>
      ) : null}
      {account.showSettings ? (
        <Link
          href="/settings"
          prefetch={false}
          className={styles.iconButton}
          data-testid="projects-settings"
          aria-label={t('office.account.company_settings')}
          title={t('office.account.company_settings')}
        >
          <Icon name="settings" size={20} />
        </Link>
      ) : null}
      <AvatarMenu
        initials={account.initials}
        name={account.name}
        email={account.email}
        showCompanySettings={account.showSettings}
      />
    </header>
  );
}
