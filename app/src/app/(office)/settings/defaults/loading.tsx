// EZD-116 (S15d States loading; Q-0214): skeleton rows while the Defaults page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="defaults" title="office.settings.section.defaults">
      <div data-testid="defaults-loading">
        <SkeletonGroup count={8}>
          <Skeleton height="34px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
