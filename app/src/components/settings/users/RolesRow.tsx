'use client';

// EZD-107 (S15 Layout "Roles row", Role card, New role; board S15k; Q-0695 decisions 05 row 141): the Roles row
// under the users table. The four preset cards with their summaries, then the custom roles ("Custom · n of
// 37"), then the dashed New role card. Loading shows skeleton cards; a failed load shows Retry (S15 States;
// Q-0214); offline, New role is disabled (S15 States "Offline": settings are read-only).
import { useT } from '../../../lib/messages';
import { PERMISSION_KEYS, type RolePreset } from '../../../lib/permissions/catalog';
import type { RoleSummary } from '../../../lib/roles/roles';
import type { MessageKey } from '../../../server/messages/catalog';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { InlineError } from '../../states/InlineError';
import { Skeleton } from '../../states/Skeleton';
import styles from './Roles.module.css';

const SUMMARY: Record<RolePreset, MessageKey> = {
  owner: 'office.roles.summary.owner',
  designer: 'office.roles.summary.designer',
  foreman: 'office.roles.summary.foreman',
  crew: 'office.roles.summary.crew',
};

export type RolesState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; roles: RoleSummary[] };

export function RolesRow({
  state,
  openId,
  online,
  onOpen,
  onNew,
  onRetry,
}: {
  state: RolesState;
  openId: string | null;
  online: boolean;
  onOpen: (role: RoleSummary) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <section
      data-testid="roles-row"
      aria-label={t('office.roles.heading')}
      className={styles.roles}
    >
      <div className={styles.rolesHead}>
        <span className={styles.rolesTitle}>{t('office.roles.heading')}</span>
        <span className={styles.rolesLimit}>{t('office.roles.no_limit')}</span>
      </div>
      {state.kind === 'error' ? (
        <div data-testid="roles-error">
          <InlineError message="office.roles.load_failed" onRetry={onRetry} />
        </div>
      ) : (
        <div className={styles.cards}>
          {state.kind === 'loading'
            ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height="96px" />)
            : state.roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  data-testid="role-card"
                  data-role-id={r.id}
                  data-preset={r.preset ?? 'custom'}
                  aria-pressed={openId === r.id}
                  className={`${styles.card} ${touch.target}${openId === r.id ? ` ${styles.cardOn}` : ''}`}
                  onClick={() => onOpen(r)}
                >
                  <span data-testid="role-card-name" className={styles.cardName}>
                    {r.name}
                  </span>
                  <span data-testid="role-card-summary" className={styles.cardSummary}>
                    {r.preset !== null
                      ? t(SUMMARY[r.preset])
                      : `${t('office.roles.custom')} · ${t('office.roles.custom_count', {
                          granted: r.defaultPermissions.length,
                          total: PERMISSION_KEYS.length,
                        })}`}
                  </span>
                </button>
              ))}
          {state.kind === 'ready' ? (
            <button
              type="button"
              data-testid="role-new"
              disabled={!online}
              className={`${styles.card} ${styles.newCard} ${touch.target}`}
              onClick={onNew}
            >
              <Icon name="add" size={18} />
              {t('office.roles.new_role')}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
