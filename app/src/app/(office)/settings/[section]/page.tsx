// EZD-103a Step 12 (vault/plans/EZD-103a.md Decided "Section page", "Unbuilt page body"; AC-EZD-103-3,
// AC-EZD-103-4; Q-0226; AC-EZD-102-3): a Settings section no page ticket has built yet shows its title only;
// without the switch, the no-access line in place (HTTP 200, URL unchanged); an unknown slug is not found.
// A page ticket's static settings/<slug>/page.tsx takes precedence over this route.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import { sectionBySlug } from '../../../../lib/settings/sections';
import { requireSession } from '../../../../server/auth/session';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  await connection();
  await requireSession();
  const section = sectionBySlug((await params).section);
  if (section === null) notFound();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, section.permission)) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  return <SettingsMain section={section.id} title={section.label} />;
}
