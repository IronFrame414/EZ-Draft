'use client';

// EZD-116 (S15d Entry points, States; 09o Value checks row 6, Effective value row 3; glossary 00i "Set in
// Defaults"): what a feature shows when a value it needs is Not set. A holder of settings_defaults gets the
// "Set in Defaults" link to /settings/defaults; anyone else gets a line to ask (controls a user lacks are
// hidden, Q-0214). A feature passes `canManage` from its own permission check.
import Link from 'next/link';
import { effectiveValue, type StoredDefaults } from '../../../lib/defaults/values';
import type { DefaultValue } from '../../../lib/defaults/registry';
import { useT } from '../../../lib/messages';

export const DEFAULTS_HREF = '/settings/defaults';

// The value a feature reads: its effective value, or null when Not set.
export function neededDefault(key: string, stored: StoredDefaults | null | undefined): DefaultValue | null {
  return effectiveValue(key, stored);
}

export function SetInDefaults({ canManage }: { canManage: boolean }) {
  const t = useT();
  if (!canManage) {
    return <span data-testid="set-in-defaults-ask">{t('office.defaults.not_set_ask')}</span>;
  }
  return (
    <Link data-testid="set-in-defaults" href={DEFAULTS_HREF} prefetch={false}>
      {t('office.defaults.set_in_defaults')}
    </Link>
  );
}
