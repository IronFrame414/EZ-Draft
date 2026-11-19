// EZD-613 (S15g States loading; Q-0214): skeleton cards while the Code edition page loads.
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { Skeleton, SkeletonGroup } from '../../../../components/states/Skeleton';

export default function Loading() {
  return (
    <SettingsMain section="code_edition" title="office.settings.section.code_edition">
      <div data-testid="code-edition-loading">
        <SkeletonGroup count={3}>
          <Skeleton height="96px" />
        </SkeletonGroup>
      </div>
    </SettingsMain>
  );
}
