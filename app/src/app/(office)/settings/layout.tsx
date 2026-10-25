// EZD-103a Step 10 (vault/plans/EZD-103a.md): every Settings page renders inside the Settings shell.
import type { ReactNode } from 'react';
import { SettingsRoot } from '../../../server/settings/settings-root';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsRoot>{children}</SettingsRoot>;
}
