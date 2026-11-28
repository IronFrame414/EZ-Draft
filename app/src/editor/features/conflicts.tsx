// EZD-1913c (editor plan 5.3 "features plug in"; 2.6 "conflict banner and list"): conflicts as a registry feature,
// moved unchanged out of ProjectEditor.
// - EZD-299 Build step 9 (vault/plans/EZD-299.md Decided D-Editor, D-Banner, D-Show; C9; Q-0511 a): the conflict banner
//   under the header card; `conflictsOpen` opens the list at start; each time the list opens (and at start with
//   `conflictsOpen`), the list is read again. D-Editor: outdated rows exist only while the problem is app_outdated;
//   they say Reload, so the save-failed, scale-failed and phase-failed banners are not shown then.
// - EZD-234 Build (11 Budgets editor download size): the conflict list panel loads through lazyModule when first
//   opened. It draws after the state column on every screen (CANVAS_END_ORDER), and is given the plan on the plan only.
import { useEffect, useState } from 'react';
import { countForProject } from '../../lib/conflicts/conflict-groups';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import { useConflictInputs, type ConflictInputs } from '../conflicts/use-conflicts';
import { LazyNotice } from '../shared/editor-notices';
import { planOnly } from '../shared/feature-slots';
import { lazyPart } from '../shared/lazy-part';
import type { EditorFeature, EditorFeatureContext } from './types';

const conflictPanelModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/conflict-panel.messages'),
    import('../../lazy/conflict-panel'),
  ),
);

const LazyConflictPanel = lazyPart(conflictPanelModule, 'ConflictPanel');

export type ConflictsOwn = {
  readonly listOpen: boolean;
  readonly setListOpen: (open: boolean) => void;
  readonly conflicts: ConflictInputs;
};

const ownOf = (ctx: EditorFeatureContext): ConflictsOwn | undefined =>
  ctx.own?.get('conflicts') as ConflictsOwn | undefined;

function useConflictsOwn(ctx: EditorFeatureContext): ConflictsOwn {
  const session = ctx.ready?.session ?? null;
  const [listOpen, setListOpen] = useState(ctx.props?.conflictsOpen === true);
  const conflicts = useConflictInputs(session, ctx.projectId, listOpen);
  // D-Editor: each time the list opens (and at start with `conflictsOpen`), the list is read again.
  useEffect(() => {
    if (listOpen && session !== null) void session.conflicts.refresh();
  }, [listOpen, session]);
  return { listOpen, setListOpen, conflicts };
}

export const feature: EditorFeature = {
  id: 'conflicts',
  order: 850,
  active: (ctx) => ctx.ready !== undefined,
  useOwn: useConflictsOwn,
  quietsSaveBanners: (ctx) => (ownOf(ctx)?.conflicts.outdatedCount ?? 0) > 0,
  header: (ctx) => {
    const own = ownOf(ctx);
    const session = ctx.ready?.session;
    if (own === undefined || session === undefined) return null;
    const count = countForProject(own.conflicts.inputs, ctx.projectId);
    return count > 0 ? (
      <LazyNotice
        name="ConflictBanner"
        count={count}
        projectName={session.model.project.name}
        othersSaved={own.conflicts.othersSaved}
        expanded={own.listOpen}
        onReview={() => own.setListOpen(true)}
      />
    ) : null;
  },
  canvasItems: [
    {
      order: 400,
      part: (ctx) => {
        const own = ownOf(ctx);
        const ready = ctx.ready;
        if (own === undefined || ready === undefined || !own.listOpen) return null;
        return (
          <LazyConflictPanel
            session={ready.session}
            projectId={ctx.projectId}
            inputs={own.conflicts.inputs}
            server={own.conflicts.server}
            plan={planOnly(ctx) ? ready.controllers.plan : null}
            onClose={() => own.setListOpen(false)}
          />
        );
      },
    },
  ],
};
