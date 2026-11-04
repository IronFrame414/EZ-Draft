// EZD-112 Step 19 (vault/plans/EZD-112.md Build steps; S01 States loading): skeleton rows while the Company
// page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="company" title="office.settings.section.company">
      <SkeletonGroup count={6}>
        <Skeleton height="36px" />
      </SkeletonGroup>
    </SettingsMain>
  );
}
