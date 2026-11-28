// EZD-1914 (editor plan 5.2 job 4): what the registry features read and which are on now, worked out for one render,
// moved unchanged out of ProjectEditor (EZD-1913a to EZD-1913c).
// - The view on screen: a feature's screen that shows, else Plan.
// - Each feature's own state first (`useOwn`), then whether this viewer may edit now: Edit model with the edit hold,
//   and no feature pausing edits (EZD-122, EZD-225); then each feature's page hook (its effects and page state).
// - The rail spec for that right to edit (`spec`); the rail shows its tools paused when it says so (EZD-225).
// - The features on now (lower order first), each told when it turns off.
// - EZD-404, EZD-412: while a feature's screen covers the plan, the plan's edit keys and zoom are off (`screenOn`).
// - EZD-1913c (EZD-5605): while a feature limits the tools, only Select is on the rail, no edit menu opens, and the
//   tablet edit bar's clipboard is off (`limited`); EZD-299: a feature may quiet the save banners (`quiet`).
// - EZD-1913a (editor plan 2.4, 2.5): the screen the slot functions read (feature-slots.tsx).
import { features } from '../features/index.generated';
import type { EditorFeature, EditorFeatureContext } from '../features/types';
import {
  activeFeatures,
  coversPlan,
  editorScreen,
  editsAllowed,
  featureFlag,
  shownView,
  useFeatureLeave,
  useFeatureOwn,
  useFeaturePages,
  withOwn,
  type EditorScreen,
} from './feature-slots';

export type EditorFeatures<S> = {
  readonly mayEdit: boolean;
  readonly spec: S;
  readonly featureCtx: EditorFeatureContext;
  readonly active: readonly EditorFeature[];
  readonly screenOn: boolean;
  readonly limited: boolean;
  readonly quiet: boolean;
  readonly screen: EditorScreen;
  /** A feature's screen covers the plan. */
  readonly covered: boolean;
};

/**
 * `baseCtx` is the context with `mayEdit` the edit hold at open (`holdsAtOpen`); `railSpec` makes the rail spec for
 * the right to edit now.
 */
export function useEditorFeatures<S extends { paused?: unknown } | null>(
  baseCtx: EditorFeatureContext,
  holdsAtOpen: boolean,
  railSpec: (mayEdit: boolean) => S,
): EditorFeatures<S> {
  const viewCtx: EditorFeatureContext = { ...baseCtx, shownView: shownView(features, baseCtx) };
  const ownCtx = withOwn(viewCtx, useFeatureOwn(features, viewCtx));
  const mayEdit = editsAllowed(features, ownCtx, holdsAtOpen);
  const pageCtx: EditorFeatureContext = { ...ownCtx, mayEdit };
  const pageOwn = useFeaturePages(features, pageCtx);
  const spec = railSpec(mayEdit);
  const featureCtx: EditorFeatureContext = {
    ...withOwn(pageCtx, pageOwn),
    toolsPaused: spec?.paused !== undefined,
  };
  const active = activeFeatures(features, featureCtx);
  useFeatureLeave(active, featureCtx);
  return {
    mayEdit,
    spec,
    featureCtx,
    active,
    screenOn: coversPlan(active),
    limited: featureFlag(features, 'limitsTools', featureCtx),
    quiet: featureFlag(features, 'quietsSaveBanners', featureCtx),
    screen: editorScreen(featureCtx),
    covered: featureCtx.shownView !== 'plan',
  };
}
