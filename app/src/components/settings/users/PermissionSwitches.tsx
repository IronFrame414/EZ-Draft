'use client';

// EZD-106 (vault/plans/EZD-106.md Part b "Inspector body"; S15 Permission switch, Group header count,
// Permissions counter; board S15): the 37 switches in the six catalog.ts groups, two columns, each group with
// "n of m". A switch is a checkbox with role="switch"; the three money subtexts are the S15 Controls text.
import { useT } from '../../../lib/messages';
import { groupCounts } from '../../../lib/users/inspector';
import { PERMISSIONS, PERMISSION_KEYS, type PermissionKey } from '../../../lib/permissions/catalog';
import type { MessageKey } from '../../../server/messages/catalog';
import touch from '../../../styles/touch.module.css';
import styles from './Users.module.css';

// S15 Controls "Permission switch": the three switches with a subtext line.
const SUBTEXT: Partial<Record<PermissionKey, MessageKey>> = {
  see_company_costs: 'office.users.perm_sub.see_company_costs',
  see_sell_prices: 'office.users.perm_sub.see_sell_prices',
  create_change_orders: 'office.users.perm_sub.create_change_orders',
};

export function PermissionSwitches({
  granted,
  disabled,
  onToggle,
}: {
  granted: readonly PermissionKey[];
  disabled: boolean;
  onToggle: (key: PermissionKey) => void;
}) {
  const t = useT();
  const on = new Set(granted);
  return (
    <div data-testid="users-permissions" className={styles.perms}>
      <div className={styles.permsHead}>
        <span className={styles.label}>{t('office.users.permissions')}</span>
        <span data-testid="users-permissions-count" className={styles.permsCount}>
          {t('office.users.permissions_of', {
            granted: granted.length,
            total: PERMISSION_KEYS.length,
          })}
        </span>
      </div>
      {groupCounts(granted).map((g) => (
        <section
          key={g.group}
          data-testid="users-group"
          data-group={g.group}
          aria-label={t(`office.users.group.${g.group}`)}
          className={styles.group}
        >
          <div className={styles.groupHead}>
            <span className={styles.groupName}>{t(`office.users.group.${g.group}`)}</span>
            <span data-testid="users-group-count" className={styles.groupCount}>
              {t('office.users.permissions_of', { granted: g.granted, total: g.total })}
            </span>
          </div>
          <div className={styles.switches}>
            {PERMISSIONS.filter((p) => p.group === g.group).map((p) => {
              const sub = SUBTEXT[p.key];
              return (
                <label key={p.key} className={`${styles.switchRow} ${touch.target}`}>
                  <span className={styles.switchText}>
                    <span>{t(`office.users.perm.${p.key}`)}</span>
                    {sub ? <span className={styles.switchSub}>{t(sub)}</span> : null}
                  </span>
                  {/* The checkbox covers the whole row, so the tap area is the row (44 px). */}
                  <input
                    type="checkbox"
                    role="switch"
                    data-testid={`user-switch-${p.key}`}
                    className={styles.switchInput}
                    checked={on.has(p.key)}
                    aria-checked={on.has(p.key)}
                    disabled={disabled}
                    onChange={() => onToggle(p.key)}
                  />
                  <span className={styles.switch} aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
