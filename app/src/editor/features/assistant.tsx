// EZD-1913c (editor plan 5.3 "features plug in"; 2.1 "Assistant panel, preview layer, Accept / Adjust / Reject"): the
// Assistant as a registry feature, moved unchanged out of ProjectEditor (spec S03c-ai-assistant).
// - EZD-5603a Build step 12 (vault/plans/EZD-5603a.md Decided "Editor wiring", "Rail button"): for an editor, one
//   Assistant session per page load (the session's loader, session/create-controllers.ts, loads it with the panel's
//   module, shared/assistant-module.ts); its rail toggle opens the Assistant panel in the inspector place, which an
//   open Assistant takes on every screen (S03c Entry points). The toggle shows on the plan for an editor who may edit.
// - EZD-5604b: the session's preview store, made with the first reply that has changes; the preview layer comes with
//   the panel's lazy module, shown while a preview is open, over the plan after the modes' layers and before the
//   version diff layer.
// - EZD-5605 D-Wire, D-Tools off (Q-0641 row 56-4; vault/build/assumptions.md EZD-5605): Adjust is made by the
//   Assistant session, which tells its listeners when Adjust starts or ends; during Adjust every rail tool but Select
//   is off, Assistant too, no edit menu opens and the tablet edit bar's clipboard is off (limitsTools).
// Only `open` is read for the page, so typing in the panel does not render the whole editor again (11 Performance).
import { useSyncExternalStore } from 'react';
import type { AssistantLoader } from '../assistant/assistant-loader';
import { assistantShown } from '../assistant/assistant-ui';
import type { PreviewStore } from '../assistant/preview-store';
import { assistantPanelModule } from '../shared/assistant-module';
import { lazyPart } from '../shared/lazy-part';
import { useStoreValue } from '../shared/use-store-value';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-5604b (11 Budgets; EZD-120c B11): the Assistant preview layer comes with the panel's lazy module, shown while
// a preview is open.
function usePreviewOpen(props: { store: PreviewStore }) {
  return useSyncExternalStore(
    props.store.subscribe,
    () => props.store.getState().preview !== null,
    () => props.store.getState().preview !== null,
  );
}

const LazyPreviewLayer = lazyPart(assistantPanelModule, 'PreviewLayer', {
  useWanted: usePreviewOpen,
});

const LazyAssistantPanel = lazyPart(assistantPanelModule, 'AssistantPanel');

type AssistantSession = ReturnType<AssistantLoader['getSession']>;

export type AssistantOwn = {
  readonly assistant: AssistantLoader | null;
  readonly session: AssistantSession | null;
  readonly preview: PreviewStore | null;
  readonly open: boolean;
  readonly adjusting: boolean;
};

const ownOf = (ctx: EditorFeatureContext): AssistantOwn | undefined =>
  ctx.own?.get('assistant') as AssistantOwn | undefined;

function useAssistantOwn(ctx: EditorFeatureContext): AssistantOwn {
  const assistant = ctx.ready?.controllers.assistant ?? null;
  // EZD-1910 (editor plan R3): the store reads go through useStoreValue (shared/use-store-value.ts).
  const session = useStoreValue(assistant, (a) => a.getSession(), null);
  const preview = useStoreValue(assistant, (a) => a.getPreview(), null);
  const open = useStoreValue(assistant, (a) => a.isOpen(), false);
  const adjusting = useStoreValue(
    assistant,
    (a) => a.getControls()?.adjust.getUi().adjusting ?? false,
    false,
  );
  return { assistant, session, preview, open, adjusting };
}

/** The loader while its rail toggle shows (an editor who may edit, on the plan), else null. */
function shown(ctx: EditorFeatureContext): AssistantLoader | null {
  const assistant = ownOf(ctx)?.assistant ?? null;
  return assistant !== null &&
    assistantShown({ canEdit: ctx.mayEdit, view: ctx.shownView ?? 'plan' })
    ? assistant
    : null;
}

export const feature: EditorFeature = {
  id: 'assistant',
  order: 720,
  active: (ctx) => ctx.ready !== undefined,
  useOwn: useAssistantOwn,
  limitsTools: (ctx) => ownOf(ctx)?.adjusting === true,
  railProps: (ctx) => {
    const on = shown(ctx);
    return {
      assistant: on !== null ? { open: ownOf(ctx)?.open === true, onToggle: on.toggle } : null,
    };
  },
  inspectorTop: (ctx) => {
    const own = ownOf(ctx);
    const session = shown(ctx) !== null && own?.open === true ? own.session : null;
    return session === null || own === undefined ? null : (
      <LazyAssistantPanel session={session} preview={own.preview} />
    );
  },
  planLayer: (ctx) => {
    const preview = ownOf(ctx)?.preview ?? null;
    const plan = ctx.ready?.controllers.plan;
    return preview !== null && plan !== undefined ? (
      <LazyPreviewLayer store={preview} handle={plan.handle} />
    ) : null;
  },
};
