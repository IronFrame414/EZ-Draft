// EZD-103b Step 10 (vault/plans/EZD-103b.md Decided "Dev page"): developer page for the Settings unsaved-edits
// guard and drafts, inside the Settings root; ?fail=1 makes Save fail. Not found in production.
import { notFound } from 'next/navigation';
import { SettingsRoot } from '../../../../server/settings/settings-root';
import { UnsavedSample } from './UnsavedSample';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const fail = (await searchParams).fail === '1';
  return (
    <SettingsRoot>
      <UnsavedSample fail={fail} />
    </SettingsRoot>
  );
}
