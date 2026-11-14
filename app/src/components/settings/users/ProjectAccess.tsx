'use client';

// EZD-129 (S15 Decision 13; board S15AccessPassword and its approved wording W1-W8; Q-0695 decisions 10 row 63):
// the Project access control of the user inspector and the Invite user dialog. All projects or Listed
// projects; under Listed, a summary ("2 projects listed", or "This person sees no projects" when the list is
// empty, which saves) and "Choose projects", which opens the picker: a search over
// GET /api/settings/users/projects, one checkbox row per project (name, address) and the "n listed" count.
// The control edits a draft only; its owner saves it with PUT /api/settings/users/[id]/scope.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useT } from '../../../lib/messages';
import { SEARCH_DEBOUNCE_MS } from '../../../lib/projects/projects';
import {
  setAccessScope,
  toggleAccessProject,
  type AccessDraft,
  type ScopeProjectChoice,
  type ScopeProjectPage,
} from '../../../lib/users/scope';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { InlineError, Skeleton } from '../../states';
import styles from './ProjectAccess.module.css';
import userStyles from './Users.module.css';

type Loaded = { status: 'loading' | 'ready' | 'error'; items: ScopeProjectChoice[]; more: boolean };

function ProjectPicker({
  idPrefix,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: AccessDraft;
  disabled: boolean;
  onChange: (d: AccessDraft) => void;
}): ReactElement {
  const t = useT();
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', items: [], more: false });
  const ctl = useRef<AbortController | null>(null);
  const lastQ = useRef('');

  const load = useCallback(async (query: string) => {
    ctl.current?.abort();
    const mine = new AbortController();
    ctl.current = mine;
    lastQ.current = query;
    setLoaded((s) => ({ ...s, status: 'loading' }));
    try {
      const res = await fetch(
        '/api/settings/users/projects?' + new URLSearchParams({ q: query.trim() }),
        { cache: 'no-store', credentials: 'same-origin', signal: mine.signal },
      );
      if (res.status !== 200) throw new Error('scope_projects_load_failed');
      const data = (await res.json()) as ScopeProjectPage;
      if (ctl.current !== mine) return;
      setLoaded({ status: 'ready', items: data.items, more: data.more });
    } catch {
      if (ctl.current !== mine || mine.signal.aborted) return;
      setLoaded((s) => ({ ...s, status: 'error' }));
    }
  }, []);

  // Open: the first page at once. A search change: again after the debounce.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(q);
      return;
    }
    const timer = setTimeout(() => void load(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, load]);

  useEffect(() => () => ctl.current?.abort(), []);

  const picked = new Set(value.projectIds);
  const { status, items, more } = loaded;
  return (
    <div data-testid={`${idPrefix}-picker`} className={styles.picker}>
      <div className={styles.searchRow}>
        <Icon name="search" size={18} />
        <input
          data-testid={`${idPrefix}-search`}
          type="search"
          className={`${styles.search} ${touch.target}`}
          placeholder={t('office.users.access.search')}
          aria-label={t('office.users.access.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {status === 'ready'
          ? items.map((p) => (
              <label
                key={p.id}
                data-testid={`${idPrefix}-project`}
                data-project-id={p.id}
                className={`${styles.row} ${touch.target}`}
              >
                {/* The checkbox covers the whole row, so the tap area is the row (44 px). */}
                <input
                  type="checkbox"
                  data-testid={`${idPrefix}-project-check`}
                  className={styles.checkInput}
                  checked={picked.has(p.id)}
                  disabled={disabled}
                  onChange={() => onChange(toggleAccessProject(value, p.id))}
                />
                <span className={styles.check} aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{p.name}</span>
                  <span className={styles.rowSub}>{p.address}</span>
                </span>
              </label>
            ))
          : null}
        {status === 'loading' ? (
          <div className={styles.states} data-testid={`${idPrefix}-loading`}>
            <Skeleton height="26px" />
            <Skeleton height="26px" />
            <Skeleton height="26px" />
          </div>
        ) : null}
        {status === 'error' ? (
          <div className={styles.states} data-testid={`${idPrefix}-load-error`}>
            <InlineError
              message="office.users.access.load_failed"
              onRetry={() => void load(lastQ.current)}
            />
          </div>
        ) : null}
        {status === 'ready' && items.length === 0 ? (
          <p className={styles.note} data-testid={`${idPrefix}-empty`}>
            {q.trim() === ''
              ? t('office.users.access.empty')
              : t('office.users.access.no_match', { query: q.trim() })}
          </p>
        ) : null}
        {status === 'ready' && more ? (
          <p className={styles.note} data-testid={`${idPrefix}-more`}>
            {t('office.users.access.more')}
          </p>
        ) : null}
      </div>
      <div className={styles.foot} data-testid={`${idPrefix}-count`}>
        {t('office.users.access.count', { count: value.projectIds.length })}
      </div>
    </div>
  );
}

// The Listed part: the summary, "Choose projects" and the picker. The Invite dialog shows it under its own
// All / Listed field; the inspector shows it inside ProjectAccess.
export function ListedProjects({
  idPrefix,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: AccessDraft;
  disabled: boolean;
  onChange: (d: AccessDraft) => void;
}): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const n = value.projectIds.length;
  return (
    <>
      <div className={styles.summary}>
        {n === 0 ? (
          <span data-testid={`${idPrefix}-summary`} className={styles.none}>
            <Icon name="block" size={18} />
            {t('office.users.access.none')}
          </span>
        ) : (
          <span data-testid={`${idPrefix}-summary`} className={styles.listed}>
            <Icon name="inventory_2" size={18} />
            {t('office.users.access.summary', { count: n })}
          </span>
        )}
        <button
          type="button"
          data-testid={`${idPrefix}-choose`}
          aria-expanded={open}
          className={`${styles.choose} ${touch.target}`}
          onClick={() => setOpen((o) => !o)}
        >
          {t('office.users.access.choose')}
        </button>
      </div>
      {open ? (
        <ProjectPicker idPrefix={idPrefix} value={value} disabled={disabled} onChange={onChange} />
      ) : null}
    </>
  );
}

export function ProjectAccess({
  idPrefix,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: AccessDraft;
  disabled: boolean;
  onChange: (d: AccessDraft) => void;
}): ReactElement {
  const t = useT();
  return (
    <div data-testid={idPrefix} className={userStyles.field}>
      <span className={userStyles.label} id={`${idPrefix}-label`}>
        {t('office.users.access.label')}
      </span>
      <div
        role="group"
        aria-labelledby={`${idPrefix}-label`}
        data-testid={`${idPrefix}-scope`}
        className={userStyles.segment}
      >
        {(['all', 'listed'] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            data-testid={`${idPrefix}-${scope}`}
            aria-pressed={value.scope === scope}
            disabled={disabled}
            className={`${userStyles.segmentButton} ${touch.target}${value.scope === scope ? ` ${userStyles.segmentOn}` : ''}`}
            onClick={() => onChange(setAccessScope(value, scope))}
          >
            {t(scope === 'all' ? 'office.users.access.all' : 'office.users.access.listed')}
          </button>
        ))}
      </div>
      {value.scope === 'all' ? (
        <p data-testid={`${idPrefix}-all-help`} className={userStyles.help}>
          {t('office.users.access.all_help')}
        </p>
      ) : (
        <ListedProjects idPrefix={idPrefix} value={value} disabled={disabled} onChange={onChange} />
      )}
    </div>
  );
}
