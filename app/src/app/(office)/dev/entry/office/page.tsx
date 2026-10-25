// EZD-020 Step 1 (vault/plans/EZD-020.md): placeholder entry page for the office entry, measured by the perf
// check until EZD-117a (Projects) and EZD-103 (Settings) add the real pages.
// EZD-103a: the Settings shell, so the perf check measures it.
import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../../../lib/messages';
import { catalogFor } from '../../../../../server/messages/catalog';
import { StateHost } from '../../../../../components/states/StateHost';
import { SettingsShell } from '../../../../../components/settings/SettingsShell';
import type { SettingsSectionId } from '../../../../../lib/settings/sections';

const NO_SECTIONS: readonly SettingsSectionId[] = [];

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <SettingsShell companyName="" initials="" allowed={NO_SECTIONS} activeMembers={null}>
          <main data-entry-placeholder="office" />
        </SettingsShell>
      </StateHost>
    </MessagesProvider>
  );
}
