'use client';

// EZD-104 Build step 17 (vault/plans/EZD-104.md Decided "Data path", "Search", "Paging", "Status bar", "Name
// cell", "Last active cell", "Resend and Copy link", "Costs info note", "Invite your team", "No match",
// "Selection", "Up / Down", "Table semantics", "Inspector", "Loading and errors", "Panel markup"; S15; Q-0695;
// Q-0706; Q-0719 (a)): Settings > Users + permissions. One page of 50 rows from GET /api/settings/users,
// searched on the server; the AsyncView renders the body only, so the search keeps focus while a page loads
// (pattern: CustomersPanel, EZD-113). The table box scrolls inside the main card.
// EZD-106 (vault/plans/EZD-106.md Part b; S15 Controls, States, More menu; Q-0695 decisions 05 row 141; Q-0706;
// Q-0724 (a); Q-0725 (a)): the inspector body (Role select with "(modified)", language toggle, grouped
// switches with counts), its footer (unsaved line, Reset, Save and Ctrl/Cmd+S), the Save / Discard / Cancel
// prompt on changing the selection (EZD-103b), the error and offline states, the selected invite's details,
// deactivated rows and the row More (…) menu (Edit, Deactivate, Reactivate, Remove). Resend, Copy link and
// Cancel invite have no action yet (EZD-105; Q-0226).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import { PERMISSION_KEYS } from '../../../lib/permissions/catalog';
import { initialsFor } from '../../../lib/users/initials';
import {
  chooseRole,
  draftModified,
  draftOf,
  pendingEdits,
  resetToRole,
  toggleSwitch,
  type InspectorDraft,
} from '../../../lib/users/inspector';
import {
  formatLastActive,
  formatUserDate,
  grantedCount,
  isModified,
  roleTone,
  USER_PAGE_SIZE,
  type UserCounts,
  type UserPage,
  type UserRole,
  type UserRow,
} from '../../../lib/users/users';
import type { MessageKey } from '../../../server/messages/catalog';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { Menu, MenuItem } from '../../menu/Menu';
import { AsyncView } from '../../states/AsyncView';
import { useConfirm } from '../../states/ConfirmProvider';
import { InlineError } from '../../states/InlineError';
import { Skeleton, SkeletonGroup } from '../../states/Skeleton';
import { StateButton } from '../../states/StateButton';
import { useToast } from '../../states/ToastProvider';
import { SettingsMain, useSettingsStatus, type SettingsStatusEntry } from '../SettingsShell';
import { useLeaveCheck, useSettingsDraft, useUnsavedChanges } from '../unsaved-changes';
import { PermissionSwitches } from './PermissionSwitches';
import styles from './Users.module.css';

export type InspectorEdit = { membershipId: string; draft: InspectorDraft };
export type InspectorError = { message: MessageKey; retry: boolean };
type MemberAction = 'deactivate' | 'reactivate' | 'remove';

// The refusals the server names (server/users/members.ts); anything else reads as the generic line.
const KNOWN_ERRORS = new Set([
  'error.last_settings_users_holder',
  'error.active_elsewhere',
  'error.member_state',
  'error.member_not_found',
  'error.not_authorized',
]);

async function knownErrorOf(res: Response): Promise<MessageKey | null> {
  const body: unknown = await res.json().catch(() => null);
  const key = (body as { error?: { message_key?: unknown } } | null)?.error?.message_key;
  return typeof key === 'string' && KNOWN_ERRORS.has(key) ? (key as MessageKey) : null;
}

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

type InspectorBodyProps = {
  row: UserRow;
  roles: readonly UserRole[];
  draft: InspectorDraft;
  saved: InspectorDraft;
  onDraft: (d: InspectorDraft) => void;
  onSave: () => void;
  saving: boolean;
  error: InspectorError | null;
  online: boolean;
};

function InviteDetails({ row }: { row: UserRow }) {
  const t = useT();
  const sent = row.invitedAt === null ? null : formatUserDate(row.invitedAt, new Date());
  return (
    <div data-testid="users-invite-details" className={styles.inviteDetails}>
      <span>{t('office.users.invite_details', { email: row.email })}</span>
      {sent === null ? null : (
        <span className={styles.inspectorSub}>
          {t('office.users.invite_sent_on', { date: t(sent.key, sent.params) })}
        </span>
      )}
      <span className={styles.inviteActions}>
        <button
          type="button"
          data-testid="users-inspector-resend"
          className={`${styles.link} ${touch.target}`}
        >
          {t('office.users.resend')}
        </button>
        {row.canCopyLink ? (
          <button
            type="button"
            data-testid="users-inspector-copy-link"
            className={`${styles.link} ${touch.target}`}
          >
            {t('office.users.copy_link')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="users-inspector-cancel-invite"
          className={`${styles.link} ${touch.target}`}
        >
          {t('office.users.cancel_invite')}
        </button>
      </span>
    </div>
  );
}

function InspectorBody(p: InspectorBodyProps) {
  const t = useT();
  const { row, roles, draft, saved, onDraft } = p;
  const role = roles.find((r) => r.id === draft.roleId) ?? null;
  const modified = draftModified(draft, role);
  const pending = pendingEdits(saved, draft);
  const locked = !p.online || p.saving;
  const isPreset = role !== null && role.preset !== null;
  return (
    <>
      <div className={styles.inspectorScroll}>
        {row.status === 'invited' ? <InviteDetails row={row} /> : null}
        <div data-testid="users-role-field" className={styles.field}>
          <label className={styles.label} htmlFor="users-role-select">
            {t('office.users.role_preset')}
          </label>
          <select
            id="users-role-select"
            data-testid="users-role-select"
            className={`${styles.select} ${touch.target}`}
            value={draft.roleId ?? ''}
            disabled={locked}
            onChange={(e) => {
              const next = roles.find((r) => r.id === e.target.value);
              if (next) onDraft(chooseRole(draft, next));
            }}
          >
            {draft.roleId === null ? (
              <option value="" disabled>
                {t('office.users.no_role')}
              </option>
            ) : null}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id === draft.roleId && modified
                  ? t('office.users.role_option_modified', { role: r.name })
                  : r.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <span className={styles.label} id="users-language-label">
            {t('office.users.language')}
          </span>
          <div
            role="group"
            aria-labelledby="users-language-label"
            data-testid="users-language"
            className={styles.segment}
          >
            {(['en', 'es'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                data-testid={`users-language-${lang}`}
                aria-pressed={draft.language === lang}
                disabled={locked}
                className={`${styles.segmentButton} ${touch.target}${draft.language === lang ? ` ${styles.segmentOn}` : ''}`}
                onClick={() => onDraft({ ...draft, language: lang })}
              >
                {t(lang === 'en' ? 'office.users.english' : 'office.users.spanish')}
              </button>
            ))}
          </div>
          <p className={styles.help}>{t('office.users.language_help')}</p>
        </div>
        <PermissionSwitches
          granted={draft.granted}
          disabled={locked}
          onToggle={(key) => onDraft(toggleSwitch(draft, key))}
        />
      </div>
      <div data-testid="users-inspector-footer" className={styles.inspectorFoot}>
        {!p.online ? (
          <p data-testid="users-inspector-offline" role="status" className={styles.offline}>
            {t('office.users.offline')}
          </p>
        ) : null}
        {p.error !== null ? (
          <div data-testid="users-inspector-error">
            <InlineError message={p.error.message} onRetry={p.error.retry ? p.onSave : undefined} />
          </div>
        ) : null}
        {pending > 0 ? (
          <p data-testid="users-unsaved" className={styles.unsaved}>
            <span className={styles.unsavedDot} aria-hidden="true" />
            {role === null
              ? t('office.users.unsaved', { count: pending })
              : t(isPreset ? 'office.users.unsaved_preset' : 'office.users.unsaved_role', {
                  count: pending,
                  role: role.name,
                })}
          </p>
        ) : null}
        <div className={styles.footButtons}>
          <StateButton
            data-testid="users-reset"
            disabled={locked || role === null}
            onClick={() => onDraft(resetToRole(draft, role))}
          >
            {t(isPreset || role === null ? 'office.users.reset_preset' : 'office.users.reset_role')}
          </StateButton>
          <StateButton
            data-testid="users-save"
            variant="primary"
            disabled={locked || pending === 0 || draft.roleId === null}
            onClick={p.onSave}
          >
            {t('office.users.save')}
          </StateButton>
        </div>
      </div>
    </>
  );
}

export function UserInspector({
  row,
  onClose,
  body,
}: {
  row: UserRow | null;
  onClose: () => void;
  body?: Omit<InspectorBodyProps, 'row'> | null;
}) {
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
        <>
          <div data-testid="users-inspector-head" className={styles.inspectorHead}>
            <UserAvatar row={row} large />
            <div className={styles.inspectorText}>
              <span data-testid="users-inspector-name" className={styles.inspectorName}>
                {row.status === 'invited' ? t('office.users.invite_pending') : shownName(row)}
              </span>
              <span data-testid="users-inspector-sub" className={styles.inspectorSub}>
                {row.status === 'invited'
                  ? row.email
                  : row.status === 'deactivated'
                    ? `${row.role?.name ?? ''}${row.role ? ' · ' : ''}${t('office.users.deactivated')}`
                    : (row.role?.name ?? '')}
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
          {body ? <InspectorBody row={row} {...body} /> : null}
        </>
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
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The selected member as last loaded. While the inspector has unsaved edits it stays selected even when a
  // search or another page hides its row, so the edits wait for the Save / Discard / Cancel prompt (AC-5).
  const [heldRow, setHeldRow] = useState<UserRow | null>(null);
  const dirtyRef = useRef(false);
  const [edit, setEdit] = useState<InspectorEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [inspectorError, setInspectorError] = useState<InspectorError | null>(null);
  const [reload, setReload] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const online = useOnline();
  const leaveCheck = useLeaveCheck();
  const ask = useConfirm();
  const toast = useToast();

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
      setRoles(data.roles);
      setCounts({ active: data.active, invited: data.invited, en: data.en, es: data.es });
      setRows(data.rows);
      const keep = dirtyRef.current;
      setHeldRow((held) =>
        held === null
          ? null
          : (data.rows.find((r) => r.membershipId === held.membershipId) ?? (keep ? held : null)),
      );
      setSelectedId((id) =>
        id !== null && (keep || data.rows.some((r) => r.membershipId === id)) ? id : null,
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
  const selected =
    rows.find((r) => r.membershipId === selectedId) ??
    (heldRow !== null && heldRow.membershipId === selectedId ? heldRow : null);

  const saved = useMemo(() => (selected === null ? null : draftOf(selected)), [selected]);
  const current =
    selected !== null && edit !== null && edit.membershipId === selected.membershipId
      ? edit.draft
      : saved;
  const dirty = saved !== null && current !== null && pendingEdits(saved, current) > 0;

  const save = useCallback(async (): Promise<boolean> => {
    if (selected === null || current === null || current.roleId === null) return false;
    const id = selected.membershipId;
    setSaving(true);
    setInspectorError(null);
    try {
      const res = await fetch(`/api/settings/users/${id}`, {
        method: 'PATCH',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roleId: current.roleId,
          language: current.language,
          grantedKeys: current.granted,
        }),
      });
      if (res.status === 200) {
        const role = roles.find((r) => r.id === current.roleId) ?? selected.role;
        const savedRow = (r: UserRow): UserRow =>
          r.membershipId === id
            ? { ...r, role, language: current.language, grantedKeys: current.granted }
            : r;
        setRows((list) => list.map(savedRow));
        setHeldRow((held) => (held === null ? null : savedRow(held)));
        setEdit(null);
        setReload((n) => n + 1);
        return true;
      }
      const known = res.status === 409 ? await knownErrorOf(res) : null;
      setInspectorError(
        known !== null
          ? { message: known, retry: false }
          : { message: 'office.users.save_failed', retry: true },
      );
      return false;
    } catch {
      setInspectorError({ message: 'office.users.save_failed', retry: true });
      return false;
    } finally {
      setSaving(false);
    }
  }, [selected, current, roles]);

  useUnsavedChanges(dirty, save);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  const restoreDraft = useCallback((v: InspectorEdit) => {
    setEdit(v);
    setSelectedId(v.membershipId);
    setHeldRow(null);
  }, []);
  useSettingsDraft<InspectorEdit>('users', dirty ? edit : null, restoreDraft);

  // Ctrl/Cmd+S saves the inspector (S15 Keyboard).
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (dirty && online && !saving) void save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, dirty, online, saving, save]);

  // Changing the selection with unsaved edits asks Save, Discard or Cancel (S15 Validation; EZD-103b).
  const changeSelection = async (id: string | null): Promise<boolean> => {
    if (id === selectedId) return true;
    if (!(await leaveCheck())) return false;
    setEdit(null);
    setInspectorError(null);
    setSelectedId(id);
    setHeldRow(id === null ? null : (rows.find((r) => r.membershipId === id) ?? null));
    return true;
  };

  const select = (id: string) => {
    void changeSelection(id).then((moved) => {
      if (moved) tableRef.current?.focus();
    });
  };

  const act = async (row: UserRow, kind: MemberAction) => {
    if (kind === 'remove') {
      const choice = await ask({
        title: 'office.users.remove_title',
        message: 'office.users.remove_message',
        params: { name: shownName(row) },
        confirmLabel: 'office.users.remove_confirm',
        tone: 'danger',
      });
      if (choice !== 'confirm') return;
    }
    const base = `/api/settings/users/${row.membershipId}`;
    let known: MessageKey | null = null;
    try {
      const res = await fetch(kind === 'remove' ? base : `${base}/${kind}`, {
        method: kind === 'remove' ? 'DELETE' : 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.status === 200) {
        if (row.membershipId === selectedId) setInspectorError(null);
        if (kind === 'remove' && row.membershipId === selectedId) {
          setEdit(null);
          setSelectedId(null);
          setHeldRow(null);
        }
        setReload((n) => n + 1);
        return;
      }
      known = await knownErrorOf(res);
    } catch {
      known = null;
    }
    const message = known ?? 'office.users.action_failed';
    if (row.membershipId === selectedId) setInspectorError({ message, retry: false });
    else toast.show({ message });
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
    void changeSelection(list[next].membershipId);
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
    if (row.status === 'deactivated') {
      return (
        <td data-testid="user-deactivated" className={`${styles.td} ${styles.lastActive}`}>
          {t('office.users.deactivated')}
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

  const moreMenu = (row: UserRow) => (
    <Menu
      label={t('office.users.more', { name: shownName(row) })}
      trigger={<Icon name="more_horiz" size={20} />}
      triggerClassName={`${styles.more} ${touch.target}`}
      triggerTestId="user-more"
      contentClassName={styles.menu}
      contentTestId="user-more-menu"
      anchorSelector="td"
    >
      <MenuItem
        testId="user-menu-edit"
        className={`${styles.menuItem} ${touch.target}`}
        onSelect={() => select(row.membershipId)}
      >
        {t('office.users.menu.edit')}
      </MenuItem>
      {row.status === 'active' ? (
        <MenuItem
          testId="user-menu-deactivate"
          className={`${styles.menuItem} ${touch.target}`}
          onSelect={() => void act(row, 'deactivate')}
        >
          {t('office.users.menu.deactivate')}
        </MenuItem>
      ) : null}
      {row.status === 'deactivated' ? (
        <MenuItem
          testId="user-menu-reactivate"
          className={`${styles.menuItem} ${touch.target}`}
          onSelect={() => void act(row, 'reactivate')}
        >
          {t('office.users.menu.reactivate')}
        </MenuItem>
      ) : null}
      {row.status !== 'invited' ? (
        <MenuItem
          testId="user-menu-remove"
          className={`${styles.menuItem} ${styles.menuDanger} ${touch.target}`}
          onSelect={() => void act(row, 'remove')}
        >
          {t('office.users.menu.remove')}
        </MenuItem>
      ) : null}
    </Menu>
  );

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
              <th className={`${styles.th} ${styles.moreCol}`} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const isSelected = row.membershipId === selectedId;
              const classes = [
                styles.tr,
                isSelected ? styles.tron : '',
                row.status === 'invited' ? styles.invitedRow : '',
                row.status === 'deactivated' ? styles.deactivatedRow : '',
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
                  <td
                    className={`${styles.td} ${styles.moreCol}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {moreMenu(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.total > USER_PAGE_SIZE ? (
          <div data-testid="users-pager" className={styles.pager}>
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
    <label data-testid="users-search-box" className={styles.search}>
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
            // A write bumps `reload`, so the page and its counts load again.
            key={reload}
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
      <UserInspector
        row={selected}
        onClose={() => void changeSelection(null)}
        body={
          selected !== null && saved !== null && current !== null
            ? {
                roles,
                draft: current,
                saved,
                onDraft: (d) => {
                  setInspectorError(null);
                  setEdit({ membershipId: selected.membershipId, draft: d });
                },
                onSave: () => void save(),
                saving,
                error: inspectorError,
                online,
              }
            : null
        }
      />
    </>
  );
}
