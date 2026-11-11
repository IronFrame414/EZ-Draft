'use client';

// EZD-104 Build step 17 (vault/plans/EZD-104.md Decided "Data path", "Search", "Paging", "Status bar", "Name
// cell", "Last active cell", "Resend and Copy link", "Costs info note", "Invite your team", "No match",
// "Selection", "Up / Down", "Table semantics", "Inspector", "Loading and errors", "Panel markup"; S15; Q-0695;
// Q-0706; Q-0719 (a)): Settings > Users + permissions. One page of 50 rows from GET /api/settings/users,
// searched on the server; the AsyncView renders the body only, so the search keeps focus while a page loads
// (pattern: CustomersPanel, EZD-113). The table box scrolls inside the main card.
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../../lib/messages';
import { PERMISSION_KEYS } from '../../../lib/permissions/catalog';
import { initialsFor } from '../../../lib/users/initials';
import {
  formatLastActive,
  formatUserDate,
  grantedCount,
  isModified,
  roleTone,
  USER_PAGE_SIZE,
  type UserCounts,
  type UserPage,
  type UserRow,
} from '../../../lib/users/users';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { AsyncView } from '../../states/AsyncView';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import styles from './Users.module.css';

// The bold line of the name cell: the name, or the email when the name is missing or blank.
const shownName = (row: UserRow): string =>
  row.name !== null && row.name.trim() !== '' ? row.name : row.email;

function UserAvatar({ row, large }: { row: UserRow; large?: boolean }) {
  const size = large ? `${styles.av} ${styles.avLarge}` : styles.av;
  if (row.status === 'invited') {
    return (
      <span data-testid="user-avatar" aria-hidden="true" className={`${size} ${styles.avPending}`}>
        <Icon name="mail" size={18} />
      </span>
    );
  }
  const tone = roleTone(row) ?? 'crew';
  return (
    <span data-testid="user-avatar" aria-hidden="true" className={`${size} ${styles[tone]}`}>
      {initialsFor(row.name, row.email)}
    </span>
  );
}

export function UserInspector({ row, onClose }: { row: UserRow | null; onClose: () => void }) {
  const t = useT();
  return (
    <aside
      data-testid="users-inspector"
      aria-label={t('office.users.inspector_label')}
      className={styles.inspector}
    >
      {row === null ? (
        <p data-testid="users-inspector-empty" className={styles.inspectorEmpty}>
          {t('office.users.inspector_empty')}
        </p>
      ) : (
        <div className={styles.inspectorHead}>
          <UserAvatar row={row} large />
          <div className={styles.inspectorText}>
            <span data-testid="users-inspector-name" className={styles.inspectorName}>
              {row.status === 'invited' ? t('office.users.invite_pending') : shownName(row)}
            </span>
            <span data-testid="users-inspector-sub" className={styles.inspectorSub}>
              {row.status === 'invited' ? row.email : (row.role?.name ?? '')}
            </span>
          </div>
          <button
            type="button"
            data-testid="users-inspector-close"
            aria-label={t('common.close')}
            className={`${styles.close} ${touch.target}`}
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      )}
    </aside>
  );
}

export function UsersPanel() {
  const t = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<UserCounts | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const load = useCallback(
    async (signal: AbortSignal): Promise<UserPage> => {
      const params = new URLSearchParams({ q: q.trim(), page: String(page) });
      const res = await fetch(`/api/settings/users?${params}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.status !== 200) throw new Error('users_load_failed');
      const data = (await res.json()) as UserPage;
      setCounts({ active: data.active, invited: data.invited, en: data.en, es: data.es });
      setRows(data.rows);
      setSelectedId((id) =>
        id !== null && data.rows.some((r) => r.membershipId === id) ? id : null,
      );
      return data;
    },
    [q, page],
  );

  const statusItems = useMemo<readonly SettingsStatusEntry[]>(
    () =>
      counts === null
        ? []
        : [
            {
              id: 'users',
              label: 'office.users.status_users',
              value: t('office.users.status_users_value', {
                active: counts.active,
                invited: counts.invited,
              }),
            },
            {
              id: 'languages',
              label: 'office.users.status_languages',
              value: t('office.users.status_languages_value', { en: counts.en, es: counts.es }),
            },
          ],
    [counts, t],
  );
  useSettingsStatus(statusItems);

  const term = q.trim();
  const selected = rows.find((r) => r.membershipId === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    tableRef.current?.focus();
  };

  const onTableKey = (list: UserRow[]) => (e: KeyboardEvent<HTMLTableElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (list.length === 0) return;
    const i = list.findIndex((r) => r.membershipId === selectedId);
    const down = e.key === 'ArrowDown';
    const next =
      i < 0
        ? down
          ? 0
          : list.length - 1
        : down
          ? Math.min(i + 1, list.length - 1)
          : Math.max(i - 1, 0);
    setSelectedId(list[next].membershipId);
  };

  const nameCell = (row: UserRow) => {
    const now = new Date();
    let bold: string;
    let sub: string | null;
    if (row.status === 'invited') {
      bold = t('office.users.invite_pending');
      if (row.invitedAt === null) sub = row.email;
      else {
        const d = formatUserDate(row.invitedAt, now);
        sub = t('office.users.invite_sent', { email: row.email, date: t(d.key, d.params) });
      }
    } else {
      bold = shownName(row);
      sub = bold === row.email ? null : row.email;
    }
    return (
      <span className={styles.person}>
        <UserAvatar row={row} />
        <span className={styles.who}>
          <span data-testid="user-name" className={styles.name}>
            {bold}
          </span>
          {sub === null ? null : (
            <span data-testid="user-sub" className={styles.sub}>
              {sub}
            </span>
          )}
        </span>
      </span>
    );
  };

  const roleCell = (row: UserRow) => {
    if (row.role === null) return null;
    const tone = roleTone(row);
    return (
      <span
        data-testid="user-role"
        data-tone={tone ?? undefined}
        className={tone ? `${styles.pill} ${styles[tone]}` : styles.pill}
      >
        {isModified(row) ? t('office.users.role_modified', { role: row.role.name }) : row.role.name}
      </span>
    );
  };

  const lastCell = (row: UserRow) => {
    if (row.status === 'active') {
      const now = new Date();
      const label = formatLastActive(row.lastActiveAt, now);
      return (
        <td data-testid="user-last-active" className={`${styles.td} ${styles.lastActive}`}>
          {t(label.key, label.params)}
        </td>
      );
    }
    return (
      <td className={`${styles.td} ${styles.links}`}>
        <button
          type="button"
          data-testid="user-resend"
          className={`${styles.link} ${touch.target}`}
        >
          {t('office.users.resend')}
        </button>
        {row.canCopyLink ? (
          <>
            {' · '}
            <button
              type="button"
              data-testid="user-copy-link"
              className={`${styles.link} ${touch.target}`}
            >
              {t('office.users.copy_link')}
            </button>
          </>
        ) : null}
      </td>
    );
  };

  const invitePrompt = (
    <div data-testid="users-invite-prompt" className={styles.invite}>
      <StateButton data-testid="users-invite-team" compact>
        {t('office.users.invite_team')}
      </StateButton>
    </div>
  );

  const body = (data: UserPage) => {
    const showInvite = term === '' && data.active + data.invited <= 1;
    if (data.total === 0) {
      if (term !== '') {
        return (
          <div data-testid="users-no-match" className={styles.empty}>
            {t('office.users.no_match')}
          </div>
        );
      }
      return showInvite ? invitePrompt : null;
    }
    const from = (data.page - 1) * USER_PAGE_SIZE + 1;
    const to = Math.min(data.page * USER_PAGE_SIZE, data.total);
    return (
      <>
        <table
          ref={tableRef}
          data-testid="users-table"
          role="grid"
          aria-label={t('office.users.table_label')}
          tabIndex={0}
          className={styles.table}
          onKeyDown={onTableKey(data.rows)}
        >
          <thead>
            <tr>
              <th className={`${styles.th} ${styles.nameCol}`}>{t('office.users.col_name')}</th>
              <th className={styles.th}>{t('office.users.col_role')}</th>
              <th className={styles.th}>{t('office.users.col_language')}</th>
              <th className={styles.th}>{t('office.users.col_permissions')}</th>
              <th className={styles.th}>{t('office.users.col_last_active')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const isSelected = row.membershipId === selectedId;
              const classes = [
                styles.tr,
                isSelected ? styles.tron : '',
                row.status === 'invited' ? styles.invitedRow : '',
              ]
                .filter((c) => c !== '')
                .join(' ');
              return (
                <tr
                  key={row.membershipId}
                  data-testid="user-row"
                  data-membership-id={row.membershipId}
                  data-status={row.status}
                  aria-selected={isSelected ? 'true' : 'false'}
                  className={classes}
                  onClick={() => select(row.membershipId)}
                >
                  <td className={`${styles.td} ${styles.nameCol}`}>{nameCell(row)}</td>
                  <td className={styles.td}>{roleCell(row)}</td>
                  <td className={styles.td}>
                    <span data-testid="user-language" className={styles.lang}>
                      {t(
                        row.language === 'es'
                          ? 'office.users.language_es'
                          : 'office.users.language_en',
                      )}
                    </span>
                  </td>
                  <td data-testid="user-permissions" className={`${styles.td} ${styles.count}`}>
                    {t('office.users.permissions_count', {
                      granted: grantedCount(row),
                      total: PERMISSION_KEYS.length,
                    })}
                  </td>
                  {lastCell(row)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.total > USER_PAGE_SIZE ? (
          <div className={styles.pager}>
            <span data-testid="users-range">
              {t('office.users.range', { from, to, total: data.total })}
            </span>
            <StateButton
              data-testid="users-prev"
              compact
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              {t('office.users.prev')}
            </StateButton>
            <StateButton
              data-testid="users-next"
              compact
              disabled={to >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              {t('office.users.next')}
            </StateButton>
          </div>
        ) : null}
        {showInvite ? invitePrompt : null}
      </>
    );
  };

  const search = (
    <label className={styles.search}>
      <Icon name="search" size={19} />
      <input
        data-testid="users-search"
        className={`${styles.searchInput} ${touch.target}`}
        aria-label={t('office.users.search')}
        placeholder={t('office.users.search')}
        maxLength={1000}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
    </label>
  );

  return (
    <>
      <SettingsMain
        section="users"
        title="office.settings.section.users"
        subtitle="office.users.subtitle"
        flush
        actions={search}
      >
        <div data-testid="users-body" className={styles.body}>
          <AsyncView
            load={load}
            skeleton={
              <SkeletonGroup count={5} className={styles.skeletons}>
                <Skeleton height="44px" />
              </SkeletonGroup>
            }
            errorMessage="office.users.load_failed"
          >
            {body}
          </AsyncView>
        </div>
        <div data-testid="users-footer" className={styles.footer}>
          <div data-testid="users-costs-note" role="note" className={styles.note}>
            <Icon name="info" size={18} />
            <span>{t('office.users.costs_note')}</span>
          </div>
        </div>
      </SettingsMain>
      <UserInspector row={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
