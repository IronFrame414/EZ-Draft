// EZD-1102 (S15f States loading): skeleton rows while the Render models page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="render_models" title="office.settings.section.render_models">
      <div data-testid="render-models-loading">
        <SkeletonGroup count={4}>
          <Skeleton height="56px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
