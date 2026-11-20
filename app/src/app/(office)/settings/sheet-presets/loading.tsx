// EZD-712 (S15c States loading; Q-0214): skeleton rows while the Sheet presets page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="sheet_presets" title="office.settings.section.sheet_presets">
      <div data-testid="sheet-presets-loading">
        <SkeletonGroup count={4}>
          <Skeleton height="72px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
