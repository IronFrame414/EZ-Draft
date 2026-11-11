'use client';
// EZD-376 Build step 6 (vault/plans/EZD-376.md; Q-0692; ARCH Errors and logging): when the plan's text atlas fails, say so over the plan.
import { useSyncExternalStore, type ReactElement } from 'react';
import { InlineError } from '../../components/states/InlineError';
import type { PlanController } from './controller';

export function PlanTextFailedBanner(props: {
  controller: Pick<PlanController, 'atlasFailed' | 'subscribeAtlasFailed'>;
}): ReactElement | null {
  const failed = useSyncExternalStore(
    props.controller.subscribeAtlasFailed,
    props.controller.atlasFailed,
    props.controller.atlasFailed,
  );
  if (!failed) return null;
  return (
    <div data-testid="plan-text-failed-banner">
      <InlineError message="office.plan.text_failed" />
    </div>
  );
}
