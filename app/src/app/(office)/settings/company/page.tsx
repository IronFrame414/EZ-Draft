// EZD-112 Step 18 (vault/plans/EZD-112.md Decided "Page"; S15a; AC-EZD-112-1; Q-0214): Settings > Company.
// Without the Company settings switch, the no-access line in place (HTTP 200, URL unchanged); a failed load
// is reported (`company_load_failed`) and shows the inline error with Retry. This static folder takes
// precedence over [section].
import { connection } from 'next/server';
import { CompanyForm, CompanyLoadError } from '../../../../components/settings/company/CompanyForm';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { CompanyData } from '../../../../lib/company/company';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { loadCompany } from '../../../../server/company/company';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_company')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let data: CompanyData | null = null;
  try {
    data = await loadCompany(createSessionClient());
  } catch {
    data = null;
  }
  if (data === null) {
    // Code only, never the caught message (ARCH Errors and logging: nothing fails silently).
    await reportError(new Error('company_load_failed'), {
      source: 'function',
      location: 'settings.company',
    });
  }
  return (
    <SettingsMain
      section="company"
      title="office.settings.section.company"
      subtitle="office.company.subtitle"
      flush
    >
      {data ? <CompanyForm initial={data} /> : <CompanyLoadError />}
    </SettingsMain>
  );
}
