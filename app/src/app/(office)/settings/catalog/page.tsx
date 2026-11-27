// EZD-614 (S15e; board S15eCatalog; Q-0766; ARCH Settings shell page contract): Settings > Catalog, with the Appliance
// rating defaults card (the other S15e parts are EZD-1609 and EZD-1617). Without settings_catalog the no-access line in
// place (HTTP 200, URL unchanged); a failed load is reported (`appliance_ratings_load_failed`) and shows the inline
// error with Retry. This static folder takes precedence over [section].
import { connection } from 'next/server';
import {
  ApplianceRatingsLoadError,
  ApplianceRatingsPage,
} from '../../../../components/settings/catalog/ApplianceRatingsPage';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { ApplianceRating } from '../../../../lib/appliance-ratings/ratings';
import { loadApplianceRatings } from '../../../../server/appliance-ratings/appliance-ratings';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_catalog')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let rows: ApplianceRating[] | null = null;
  try {
    rows = await loadApplianceRatings(createSessionClient());
  } catch {
    rows = null;
  }
  if (rows === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('appliance_ratings_load_failed'), {
      source: 'function',
      location: 'settings.catalog',
    });
    return <ApplianceRatingsLoadError />;
  }
  return <ApplianceRatingsPage initial={rows} />;
}
