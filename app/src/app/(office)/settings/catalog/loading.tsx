// EZD-614 (S15e States loading): a skeleton card while the Catalog settings page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="catalog" title="office.settings.section.catalog">
      <div data-testid="appliance-ratings-loading">
        <SkeletonGroup count={1}>
          <Skeleton height="240px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
