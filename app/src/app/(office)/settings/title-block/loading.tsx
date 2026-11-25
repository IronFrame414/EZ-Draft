// EZD-709 (S15b States loading; Q-0214): skeleton cards while the Title block page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="title_block" title="office.settings.section.title_block">
      <div data-testid="title-block-loading">
        <SkeletonGroup count={3}>
          <Skeleton height="96px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
