'use client';
// EZD-120c Build step 6 (vault/plans/EZD-120c.md section 3; Decided "Open", "Frame", "Header", "Canvas", "Test
// hook", "Report, dispose"; Q-0500; Q-0214; Q-0501; Q-0505; Q-0506): the editor for one project. The frame has no
// rail, panels or status items yet; the canvas area shows loading, a failed load with Retry, no access, not
// found, or, for an editor, the offline and save-failed banners. The header names the project and, for an editor,
// whether the work is saved.
// EZD-207a Build step 16 (vault/plans/EZD-207a.md Decided "Editor wiring", "Test hook"; Q-0568; Q-0500; Q-0214):
// ready, the plan canvas fills the frame behind the cards and the Plan tab is the one view; a canvas that cannot
// start shows an inline error with Retry.
// EZD-376 Build step 7 (vault/plans/EZD-376.md; Q-0692): ready, a plan whose text atlas failed shows the text-failed banner in the state column, for every viewer.
// EZD-210b Build step 12 (vault/plans/EZD-210b.md Decided "Rail mode", "Editor wiring", "Messages"; Q-0568): the
// drawing rail (disabled while loading, absent without Edit model) and, over the plan, the drawing layer.
// EZD-221b Build step 13 (vault/plans/EZD-221b.md Decided "Empty hint"; S03 States; Q-0591 (a)): a plan with no
// walls shows the draw-walls hint over the canvas, for an editor only.
// EZD-208b Build step 7 (vault/plans/EZD-208b.md section 3; DB1, DB3, DB7, DB11, DB15; Q-0630 rows 9, 28; Q-0633 G9):
// selection for every viewer: the rail from `editorRail` with Select first, the selection layer over the plan, the
// tablet edit bar first in the canvas state column, and `window.__ezdraftSelection` with `devHooks`.
// EZD-219 Build step 15 (vault/plans/EZD-219.md Decided "Editor wiring"; Q-0568; Q-0680 (b)): ready, the status bar
// shows Scale, Snap, Cursor and Zoom; the project's plan scale is held in a ScaleSetting that the plan follows, and
// a failed scale save shows its own "Changes not saved" banner unless the model's shows.
// EZD-217 Build step 8 (vault/plans/EZD-217.md Decided "Editor wiring"): the edit controller (Delete, Copy, Paste,
// Duplicate, Undo, Redo) beside the selection, given to the selection layer and the tablet edit bar.
// EZD-212c (vault/plans/EZD-212c.md D21): the drawing layer's tablet Cancel turns the tool off.
// EZD-218 (S03 Controls — left panel; AC-EZD-218-1 to -5): the left panel with Layers and Rooms for every viewer of
// a ready plan. The layer store wraps the phase setting: the canvas draws what is shown, and selection picks what
// is shown and not locked; the panel and the plan share one derived-values cache for room areas.
// EZD-223 (S03 Sketch; Q-0392): the drawing controller reads the viewer's iPad drawing setting from the load.
// EZD-233 (S03 Context menu; Inspector More; vault/build/assumptions.md EZD-233): for an editor, a right-click or long
// press on the plan with no drawing tool on opens the context menu (an object under it that is not selected is
// selected first, with its group); the inspector footer's More opens the More menu. Both load lazily.
// EZD-6001 (vault/plans/EZD-6001.md D-Store, D-Wire, D-Mount; Q-0509; Q-0666): one floor view per session, given to
// every controller and panel that reads the open floor; the Floor control is first in the status bar.
// EZD-224b Build step 10 (vault/plans/EZD-224b.md Decided "Dev hook"; Q-0681 (a)): `__ezdraftEditor.checkpoint()`
// drains the outbox, then makes a checkpoint with the plan's thumbnail through a lazily loaded module.
// EZD-225 (S03 States; S06:48, 78, 100; Q-0697 decisions 05): Edit model without the right to edit now shows the
// drawing tools paused; every edit path reads `mayEdit`.
// EZD-1913a (editor plan 5.3): the registry features (features/index.generated.ts) fill the overlay, left panel,
// inspector and status slots; shared/feature-slots.tsx says which part shows where.
// EZD-1913b: the plan's surface and the other things the features share live in one page object
// (shared/feature-page.ts); the features' page hooks run each render, and they fill the plan layer, the state
// column's last row, the left panel's and the selection inspector's props too.
// EZD-1913c (editor plan 2.1, 2.6, 5.3): the editor's other features moved into features/ as well. ProjectEditor
// names none of them: it asks the slot functions for the screen (a feature's screen covers the plan), the header tabs,
// the header's props and parts, the rail's props, the state column and the canvas's end, and works out `mayEdit` from
// what the features say (shared/feature-slots.tsx, `editsAllowed`). The dev hooks keep their names (dev-hooks.ts).
// EZD-304 (S01 PDF: scale calibration; Q-0203): the project's newest calibrated PDF lies under the plan for tracing;
// for an editor, a PDF with no scale shows a banner with Set scale. Files added from the header (the page's
// `filesChanged`) make it read them again.
// EZD-1401 (11 Offline; S17 Offline status icon; AC-EZD-1401-1): the model load is stored on the device and, with no
// network, answered read-only from that copy (lib/pwa/project-cache.ts); the header shows the offline icon.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { DeviceLayout } from '../components/device/DeviceLayout';
import { commandForKey } from '../lib/defaults/shortcut-keys';
import { railToolsWithKeys, shortcutText } from './help/rail-keys';
import { nextRailOrder } from '../components/shell/rail-types';
import { isTypingTarget } from './typed-entry/typed-entry';
import { EditorFrame } from '../components/shell/EditorFrame';
import { EditorHeader } from '../components/shell/EditorHeader';
import { EditorReview } from './review/EditorReview';
import type { EditorView } from '../components/shell/editor-views';
import { HeaderCard } from '../components/shell/HeaderCard';
import { StatusBar } from '../components/shell/StatusBar';
import { Wordmark } from '../components/shell/Wordmark';
import { InlineError } from '../components/states/InlineError';
import { OfflineBanner } from '../components/states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../components/states/Skeleton';
import { useToast } from '../components/states/ToastProvider';
import { useCoarsePointer } from '../lib/device/useDeviceLayout';
import { useT } from '../lib/messages';
import type { MessageKey } from '../server/messages/catalog';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from './editor-session';
import { hubResync } from './project-defaults';
import { InspectorMore, InspectorStack } from './edit/InspectorMore';
import type { EditMenuRequest } from '../lazy/edit-menu';
import { expandGroups } from './selection/groups';
import { EmptyPlanHint } from './EmptyPlanHint';
import { InspectorEmpty } from './inspector/InspectorEmpty';
import type { InspectorPanelProps } from '../lazy/inspector-panel';
import { FloorSwitcher } from './floors/FloorSwitcher';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { PlanTextFailedBanner } from './plan/PlanTextFailedBanner';
import { usePdfUnderlay } from './plan/PdfUnderlay';
import { ZoomStack } from './plan/ZoomStack';
import { lazyModule } from '../lib/lazy/lazy-module';
import { lazyPart } from './shared/lazy-part';
import { useStoreValue } from './shared/use-store-value';
import { editorDefaults, useDefault } from './shared/use-default';
import { SelectionLayer } from './selection/SelectionLayer';
import { editorRail } from './selection/selection-controller';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';
import { OfflineStatusIcon } from './OfflineStatusIcon';
import { createProjectCache } from '../lib/pwa/project-cache';
import {
  PhaseFailedBanner,
  PlanScaleFailedBanner,
  PlanStatusEnd,
  PlanStatusStart,
} from './status/PlanStatus';
import { LeftPanel } from './layers/LeftPanel';
import { deviceSnapSettings } from './status/view-settings';
import { fixturesModule } from './tools/fixtures-module';
import { DrawingLayer, DrawingRail } from './tools/DrawingTools';
import { CheckPill } from './check/CheckPill';
import { useCodeCheck } from './check/use-code-check';
import { useDevHooks } from './dev-hooks';
import { createControllers, type EditorControllers } from './session/create-controllers';
import { features } from './features/index.generated';
import type { EditorFeatureContext, FeatureProps, FeatureReady } from './features/types';
import { LazyNotice } from './shared/editor-notices';
import { editMenuModule } from './shared/edit-menu-module';
import { createFeaturePage } from './shared/feature-page';
import {
  activeFeatures,
  CANVAS_END_ORDER,
  coversPlan,
  editorInspector,
  editorLeftPanel,
  editorScreen,
  editorStatusEnd,
  editorStatusStart,
  editorViews,
  editsAllowed,
  featureDevParts,
  featureFlag,
  featureItems,
  featureParts,
  featureProps,
  featureSlot,
  headerProps,
  knownView,
  planHidden,
  railClasses,
  railProps,
  screenPart,
  shownView,
  STATE_ORDER,
  useFeatureLeave,
  useFeatureOwn,
  useFeaturePages,
  withOwn,
} from './shared/feature-slots';
import styles from './ProjectEditor.module.css';

// EZD-1911: kept here for the code that reads it from ProjectEditor.
export type { EditorTestHook } from './dev-hooks';

// EZD-120d: `openDeps` is passed to openEditorSession (the test page injects a fault into the save); `onSession`
// is told when the session is ready, then null when it is disposed. EZD-1913c: the props only features read are
// FeatureProps (features/types.ts), given to them whole.
export type ProjectEditorProps = FeatureProps & {
  projectId: string;
  devHooks: boolean;
  openDeps?: OpenDeps;
  onSession?: (session: EditorSession | null) => void;
  // EZD-237 (vault/plans/EZD-237.md D-Editor): `?benchmark=run`, opened in the Benchmark card's frame.
  benchmark?: boolean;
  // EZD-230 (Q-0038): the user's own rail tool order, read by the page; the default order without it.
  railOrder?: readonly string[];
  // EZD-416: the viewer holds Settings → Defaults (a feature's "Change in company settings" link).
  canManageDefaults?: boolean;
  // EZD-503 (S05 Read heights from scan "Only when a GLB mesh exists for the project"): the project's Polycam GLB
  // link the page signed; absent without one.
  meshUrl?: string | null;
};

type CanvasState =
  | { kind: 'loading' }
  | Exclude<OpenResult, { kind: 'ready' }>
  | ({ kind: 'ready'; session: EditorSession } & EditorControllers);

const noop = () => {};

export function ProjectEditor({
  projectId,
  devHooks,
  openDeps,
  onSession,
  benchmark,
  railOrder: initialRailOrder,
  canManageDefaults = false,
  meshUrl = null,
  ...props
}: ProjectEditorProps): ReactElement {
  const t = useT();
  const [state, setState] = useState<CanvasState>({ kind: 'loading' });
  // EZD-1913b: what the plan's features share for this page (the plan's surface first, EZD-502). EZD-505: made before
  // the session, which selection reads. EZD-1913c: the header tab chosen starts at the page's.
  const [page] = useState(() => createFeaturePage(props.initialView));
  const [attempt, setAttempt] = useState(0);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const [menu, setMenu] = useState<EditMenuRequest | null>(null);
  // EZD-1401 (11 Offline): this page's copy of the open project's data, and the header icon's state.
  // One per project, so another project's stored state never shows.
  const projectCache = useMemo(() => createProjectCache(), [projectId]);
  const openDepsRef = useRef(openDeps);
  const onSessionRef = useRef(onSession);
  const messageRef = useRef<(key: MessageKey) => void>(noop);
  const toast = useToast();
  useEffect(() => {
    openDepsRef.current = openDeps;
    onSessionRef.current = onSession;
  });
  useEffect(() => {
    messageRef.current = (key) => toast.show({ message: key });
  }, [toast]);

  useEffect(() => {
    let live = true;
    let dispose: (() => void) | null = null;
    // EZD-116 (AC-EZD-116-8): the session re-reads the defaults on the project channel resync.
    // EZD-1401: the model load goes through the project cache (stored online, read-only from the copy offline).
    const deps = openDepsRef.current;
    void openEditorSession(projectId, {
      resync: hubResync,
      ...deps,
      fetchImpl: projectCache.wrap(deps?.fetchImpl ?? globalThis.fetch.bind(globalThis)),
    }).then((result) => {
      if (!live) {
        if (result.kind === 'ready') result.session.dispose();
        return;
      }
      if (result.kind === 'ready') {
        // EZD-1912: the controllers are built and disposed in session/create-controllers.ts.
        const made = createControllers({
          projectId,
          session: result.session,
          onMessage: (key) => messageRef.current(key),
          ...page.controllerDeps,
        });
        dispose = () => {
          made.dispose();
          result.session.dispose();
          onSessionRef.current?.(null);
        };
        onSessionRef.current?.(result.session);
        setState({ kind: 'ready', session: result.session, ...made.controllers });
        return;
      }
      setState(result);
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [projectId, attempt, page, projectCache]);

  const session = state.kind === 'ready' ? state.session : null;
  const plan = state.kind === 'ready' ? state.plan : null;
  const drawing = state.kind === 'ready' ? state.drawing : null;
  const selection = state.kind === 'ready' ? state.selection : null;
  const edit = state.kind === 'ready' ? state.edit : null;
  const coarse = useCoarsePointer();
  const scale = state.kind === 'ready' ? state.scale : null;
  const phase = state.kind === 'ready' ? state.phase : null;
  const layers = state.kind === 'ready' ? state.layers : null;
  const derived = state.kind === 'ready' ? state.derived : null;
  const floors = state.kind === 'ready' ? state.floors : null;
  const sync = session?.sync ?? null;

  // EZD-1913a: the rail tool on now, which the registry features read.
  const tool = useStoreValue(drawing, (d) => d.getUi().tool ?? null, null);
  // EZD-1985 (Q-0809 (a)): while the Fixtures tool is on, its panel docks in the inspector place, like the
  // other modes' inspectors, instead of floating over the plan. The choice is the controller's own object, so the
  // snapshot is stable between renders.
  const fixtureChoice = useStoreValue(
    drawing,
    (d) => (d.getUi().tool === 'fixtures' ? d.getUi().fixtureChoice : null),
    null,
  );
  // EZD-1910 (editor plan R12): every Defaults reader below goes through useDefault (shared/use-default.ts).
  const sessionDefaults = session?.defaults ?? null;
  // EZD-222 (S15d Keyboard shortcuts; phase-02.md EZD-222 "rail and tooltips read bindings"): the company key map,
  // re-read on every defaults resync; the rail's tooltips show it.
  const bindings = useDefault(sessionDefaults, editorDefaults.keyboardShortcuts);
  // EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): the user's own tool order, read
  // by the page. A move shows at once and is saved; a failed save shows a toast and the rail keeps the new order for
  // this page.
  const [railOrder, setRailOrder] = useState<readonly string[]>(initialRailOrder ?? []);
  const onRailReorder = useCallback((shown: string[]) => {
    setRailOrder((stored) => {
      const next = nextRailOrder(shown, stored);
      void fetch('/api/profile/rail-order', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: next }),
      })
        .then((r) => r.ok)
        .catch(() => false)
        .then((ok) => {
          if (!ok) messageRef.current('office.rail.order_save_failed');
        });
      return next;
    });
  }, []);
  const editorReady = state.kind === 'ready';
  // EZD-612 (S03 Check; S06 Check, Check status pill; 04 Tool rail "Check | Shift+C"): the code check on a loaded
  // editor. It flushes unsaved edits first, so the check reads what is on screen.
  const flushEdits = useCallback(async () => {
    await sync?.flush();
  }, [sync]);
  const codeCheck = useCodeCheck({
    projectId,
    enabled: editorReady,
    store: session?.store ?? null,
    flush: flushEdits,
  });
  const runCheck = codeCheck.runCheck;
  const checkKeyOn = editorReady && codeCheck.canRun;
  useEffect(() => {
    if (!checkKeyOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'check') return;
      e.preventDefault();
      runCheck();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checkKeyOn, bindings, runCheck]);
  // Go to (S03 "click a warning to zoom to the object"): selects the object and zooms to it; a hidden phase is shown.
  const goToObject = useCallback(
    (id: string) => {
      if (plan === null) return;
      const status = (
        session?.store.getState().objects.get(id)?.data as { status?: string } | undefined
      )?.status;
      if (layers !== null && status !== undefined) {
        const eyes = layers.eyes() as Record<string, boolean>;
        if (eyes[status] === false) layers.setEye(status as never, true);
      }
      selection?.select([id]);
      plan.handle.showObject(id);
    },
    [plan, session, layers, selection],
  );
  const checkObjectName = useCallback(
    (id: string): string | null => {
      const o = session?.store.getState().objects.get(id);
      if (o === undefined) return null;
      const a = (o.data as { attributes?: { name?: unknown; kind?: unknown } }).attributes;
      if (typeof a?.name === 'string' && a.name !== '') return a.name;
      const kind = typeof a?.kind === 'string' ? a.kind : o.type;
      const words = kind.replace(/_/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    },
    [session],
  );
  const checkParts =
    editorReady && (codeCheck.canRun || codeCheck.run !== null) ? (
      <>
        <CheckPill
          run={codeCheck.run}
          changedSinceRun={codeCheck.changedSinceRun}
          onOpen={codeCheck.show}
        />
        {codeCheck.open ? (
          <LazyCheckPanel
            status={codeCheck.status}
            run={codeCheck.run}
            changedSinceRun={codeCheck.changedSinceRun}
            canRun={codeCheck.canRun}
            canAccept={codeCheck.canAccept}
            objectName={checkObjectName}
            onGoTo={goToObject}
            onRun={codeCheck.runCheck}
            onAccept={codeCheck.accept}
            onClose={codeCheck.close}
          />
        ) : null}
      </>
    ) : null;

  // Retry and a feature's reopen: a new session (it only sets state, so it is the same function on every render).
  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // EZD-1913c: the header tab chosen, and a press of one (each feature hears every press; Plan and the features' tabs
  // are chosen).
  const chosenView = useStoreValue(page.view, (v) => v.get(), 'plan');
  const changeView = useCallback(
    (v: EditorView) => {
      page.viewPressed.notify(v);
      if (knownView(features, v)) page.view.set(v);
    },
    [page],
  );
  const showPlan = plan !== null && !canvasFailed;

  // EZD-1913a: what the registry features read, and the ones on now (lower order first).
  const showMessage = useCallback((key: MessageKey) => toast.show({ message: key }), [toast]);
  const ready: FeatureReady | undefined =
    state.kind === 'ready'
      ? {
          session: state.session,
          controllers: state,
          bindings,
          coarse,
          canEditModel: state.session.lock.canEditModel,
          meshUrl,
          onMessage: showMessage,
        }
      : undefined;
  // Edit model with the edit hold at open (`viewer.canEdit`, editor-session.ts).
  const holdsAtOpen = session?.model.viewer.canEdit ?? false;
  const baseCtx: EditorFeatureContext = {
    projectId,
    tool,
    store: session?.store ?? null,
    floors: floors ?? undefined,
    mayEdit: holdsAtOpen,
    defaults: sessionDefaults,
    canManageDefaults,
    page,
    props,
    reopen: retry,
    chosenView,
    planUp: showPlan,
    ...(ready === undefined ? {} : { ready }),
  };
  const viewCtx: EditorFeatureContext = { ...baseCtx, shownView: shownView(features, baseCtx) };
  // EZD-1913c: each feature's own state first, then whether this viewer may edit now: Edit model with the edit hold,
  // and no feature pausing edits (EZD-122, EZD-225).
  const ownCtx = withOwn(viewCtx, useFeatureOwn(features, viewCtx));
  const mayEdit = editsAllowed(features, ownCtx, holdsAtOpen);
  const pageCtx: EditorFeatureContext = { ...ownCtx, mayEdit };
  // EZD-1913b: each feature's page hook (its effects and page state); its slots read what it gave.
  const pageOwn = useFeaturePages(features, pageCtx);
  const canEdit = mayEdit;
  const spec = editorRail({
    editor: state.kind,
    canEdit,
    canEditModel: session?.lock.canEditModel,
    canvasFailed,
    controllerEnabled: drawing?.getUi().enabled ?? false,
  });
  const featureCtx: EditorFeatureContext = {
    ...withOwn(pageCtx, pageOwn),
    toolsPaused: spec?.paused !== undefined,
  };
  const active = activeFeatures(features, featureCtx);
  useFeatureLeave(active, featureCtx);
  // EZD-404, EZD-412: while a feature's screen covers the plan, the plan's edit keys (Delete, copy, paste, undo) and
  // zoom are off.
  const screenOn = coversPlan(active);
  // EZD-1913c (EZD-5605): while a feature limits the tools, only Select is on the rail, no edit menu opens, and the
  // tablet edit bar's clipboard is off.
  const limited = featureFlag(features, 'limitsTools', featureCtx);
  const quiet = featureFlag(features, 'quietsSaveBanners', featureCtx);
  // EZD-1913a (editor plan 2.4, 2.5): the screen; the slot functions (shared/feature-slots.tsx) pick the part that
  // shows in each place, with the registry features in their places.
  const screen = editorScreen(featureCtx);
  const covered = featureCtx.shownView !== 'plan';
  const planShown = showPlan && !covered;

  const pdfUnderlay = usePdfUnderlay({ projectId, plan, canEdit: mayEdit });
  const refreshUnderlay = pdfUnderlay.refresh;
  useEffect(() => page.filesChanged.add(refreshUnderlay), [page, refreshUnderlay]);

  // EZD-1911: the dev and test hooks (`__ezdraftEditor`, `__ezdraftPlan`, `__ezdraftSelection` and the one a feature
  // gives its parts to).
  useDevHooks({
    devHooks,
    projectId,
    session,
    sync,
    plan,
    phase,
    selection,
    ...featureDevParts(features, featureCtx),
  });

  const menuCanEdit = mayEdit;
  useEffect(() => {
    if (plan === null || selection === null || drawing === null || session === null) return;
    if (!menuCanEdit) return;
    return plan.handle.onContextMenu((screen, client) => {
      if (drawing.getUi().tool !== null) return false;
      // EZD-5605 (vault/build/assumptions.md): no edit menu while the tools are limited.
      if (limited) return true;
      const hit = selection.pickAt(plan.handle.screenToModel(screen))[0];
      if (hit !== undefined) {
        const lower = hit.toLowerCase();
        if (!selection.getUi().ids.some((id) => id.toLowerCase() === lower))
          selection.select(expandGroups(session.store.getState().objects, [hit]));
      }
      setMenu({ kind: 'canvas', at: client });
      return true;
    });
  }, [plan, selection, drawing, session, menuCanEdit, limited]);

  const clientName = session?.model.project.clientName ?? null;
  // The header subtitle: the client, a feature's middle item, the save state.
  const subtitleMiddle = featureSlot(active, 'headerSubtitle', featureCtx);
  const subtitle = useMemo(
    () => [clientName, subtitleMiddle, sync ? <SaveStateText sync={sync} /> : null],
    [clientName, subtitleMiddle, sync],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const header = (
    <>
      {session === null ? (
        <HeaderCard>
          <Wordmark href="/" />
        </HeaderCard>
      ) : (
        <EditorHeader
          projectsHref="/"
          projectName={session.model.project.name}
          subtitle={subtitle}
          activeView={featureCtx.shownView ?? 'plan'}
          views={editorViews(features, featureCtx)}
          onViewChange={changeView}
          {...headerProps(active, featureCtx)}
          // EZD-127: the review pill (every viewer), then the features' header items.
          reviewPill={
            <>
              {/* EZD-1401 (S17 Offline status icon): on the header's right, as beside the revision badge on the board. */}
              <OfflineStatusIcon
                cache={projectCache}
                projectId={projectId}
                queued={session.queued}
                sync={sync}
              />
              <EditorReview projectId={projectId} />
              {featureParts(active, 'headerEnd', featureCtx)}
            </>
          }
        />
      )}
      {featureParts(active, 'header', featureCtx)}
    </>
  );

  let body: ReactNode = null;
  if (state.kind === 'loading') {
    body = (
      <SkeletonGroup count={1} className={styles.fill}>
        <Skeleton width="100%" height="100%" radius="lg" />
      </SkeletonGroup>
    );
  } else if (state.kind === 'failed') {
    body = <InlineError message="office.editor.load_failed" onRetry={retry} />;
  } else if (state.kind === 'no-access') {
    body = <LazyNotice name="NoAccess" />;
  } else if (state.kind === 'not-found') {
    body = (
      <p className={styles.notice} data-testid="editor-not-found">
        {t('error.page_not_found')}
      </p>
    );
  } else {
    const retryCanvas = () => {
      setCanvasFailed(false);
      setCanvasAttempt((n) => n + 1);
    };
    body = featureItems(
      STATE_ORDER,
      {
        editBar:
          planShown && coarse && selection !== null
            ? () => (
                <LazyEditBar
                  selection={selection}
                  edit={mayEdit && !screenOn ? edit : null}
                  clipboardOff={limited}
                />
              )
            : null,
        banners:
          sync !== null
            ? () => (
                <>
                  <OfflineBanner message="office.editor.offline" />
                  {/* EZD-299 D-Editor: a feature may quiet these banners (its rows say Reload). */}
                  {quiet
                    ? null
                    : (featureSlot(active, 'saveBanner', featureCtx) ?? (
                        <SaveFailedBanner sync={sync} />
                      ))}
                  {quiet || scale === null ? null : (
                    <PlanScaleFailedBanner scale={scale} sync={sync} />
                  )}
                  {quiet || phase === null ? null : <PhaseFailedBanner phase={phase} sync={sync} />}
                </>
              )
            : null,
        canvasFailed: canvasFailed
          ? () => <InlineError message="office.plan.canvas_failed" onRetry={retryCanvas} />
          : null,
        // EZD-1001a: plan-only parts are off while a feature's screen shows.
        planRows: planShown
          ? () => (
              <>
                <PlanTextFailedBanner controller={plan} />
                {pdfUnderlay.part}
                {/* EZD-1913b: a feature's last row of this column (EZD-1979: below the edit bar and every banner). */}
                {featureParts(active, 'stateRow', featureCtx)}
              </>
            )
          : null,
      },
      active,
      'stateItems',
      featureCtx,
    );
  }

  const stateArea = (
    <div
      className={showPlan ? `${styles.state} ${styles.besideStack}` : styles.state}
      data-testid="editor-state"
      data-editor-state={state.kind}
    >
      {body}
    </div>
  );
  // EZD-222: each rail tool shows the company's key for it.
  const railSpec =
    spec === null
      ? null
      : {
          ...spec,
          tools: railToolsWithKeys(spec.tools, bindings),
        };
  const rail =
    railSpec === null ? null : (
      <DrawingRail
        drawing={drawing}
        selection={selection}
        // EZD-5605 D-Tools off (Q-0641 row 56-4): while the tools are limited every rail tool but Select is off.
        rail={limited ? { ...railSpec, only: 'select' } : railSpec}
        surface={page.surface}
        {...railProps(active, featureCtx)}
        check={checkKeyOn ? { shortcut: shortcutText(bindings, 'check'), onRun: runCheck } : null}
        bindings={bindings}
        order={railOrder}
        onReorder={onRailReorder}
      />
    );
  // After the state column on every screen: the features' items, with the code check (plan only) in its place.
  const canvasEnd = (check: boolean) =>
    featureItems(
      CANVAS_END_ORDER,
      { check: check ? () => checkParts : null },
      active,
      'canvasItems',
      featureCtx,
    );
  const canvas = covered ? (
    <>
      {screenPart(features, featureCtx, 'screenCanvas')}
      {stateArea}
      {canvasEnd(false)}
    </>
  ) : showPlan ? (
    <>
      <PlanInputSurface controller={plan} />
      {screenOn ? null : <ZoomStack handle={plan.handle} />}
      {/* EZD-1913b: the features' plan layers, under the plan's own layers. */}
      {featureParts(active, 'planLayer', featureCtx)}
      {drawing !== null ? (
        <DrawingLayer
          controller={drawing}
          handle={plan.handle}
          canEdit={canEdit}
          onCancel={() => (selection !== null ? selection.selectTool() : drawing.selectTool(null))}
        />
      ) : null}
      {selection !== null ? (
        <SelectionLayer selection={selection} edit={mayEdit && !screenOn ? edit : null} />
      ) : null}
      {session !== null ? (
        <EmptyPlanHint store={session.store} canEdit={canEdit} floors={floors ?? undefined} />
      ) : null}
      {benchmark === true && session !== null && drawing !== null ? (
        <LazyBenchmarkRunner
          plan={plan}
          drawing={drawing}
          store={session.store}
          canEdit={canEdit}
        />
      ) : null}
      {session !== null && edit !== null && selection !== null && canEdit ? (
        <LazyEditMenus
          request={menu}
          edit={edit}
          selection={selection}
          store={session.store}
          onClose={closeMenu}
          onMessage={(key) => messageRef.current(key)}
          floors={floors ?? undefined}
        />
      ) : null}
      {session !== null ? featureParts(active, 'overlay', featureCtx) : null}
      {stateArea}
      {canvasEnd(true)}
    </>
  ) : (
    <>
      {stateArea}
      {canvasEnd(false)}
    </>
  );
  // EZD-213b (vault/plans/EZD-213b.md D-Editor): the inspector aside for every viewer of a ready plan.
  const inspectorPlace = editorInspector(screen, active, featureCtx, {
    fixtures:
      drawing !== null && fixtureChoice !== null
        ? () => <LazyFixturesPanel choice={fixtureChoice} onChoose={drawing.setFixtureChoice} />
        : null,
    selection:
      session !== null && selection !== null
        ? () => (
            <InspectorStack>
              <LazyInspectorPanel
                store={session.store}
                selection={selection}
                canEdit={canEdit}
                drawing={drawing}
                newStatus={phase === null ? undefined : phase.newObjectStatus}
                floors={floors ?? undefined}
                projectId={projectId}
                {...featureProps(active, 'inspectorProps', featureCtx)}
              />
              <InspectorMore
                selection={selection}
                canEdit={canEdit}
                onOpen={(at) => setMenu({ kind: 'more', at })}
              />
            </InspectorStack>
          )
        : null,
  });
  const leftPanel = editorLeftPanel(
    screen,
    features,
    active,
    featureCtx,
    session !== null && selection !== null && layers !== null && plan !== null
      ? () => (
          <LeftPanel
            store={session.store}
            layers={layers}
            selection={selection}
            showObject={plan.handle.showObject}
            canEdit={canEdit}
            roomArea={derived?.roomAreaSqFt}
            floors={floors ?? undefined}
            projectId={projectId}
            {...featureProps(active, 'leftPanelProps', featureCtx)}
          />
        )
      : null,
  );
  // EZD-702a: one wrapper on every tab, so a feature's screen and back never remounts the plan canvas.
  const backdrop = showPlan ? (
    <div
      className={
        planHidden(features, featureCtx)
          ? `${styles.backdropLayer} ${styles.backdropHidden}`
          : styles.backdropLayer
      }
    >
      <PlanCanvas key={canvasAttempt} controller={plan} onFailed={() => setCanvasFailed(true)} />
    </div>
  ) : undefined;

  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={header}
          rail={
            covered || rail === null ? null : (
              // EZD-1986: the wrapper is always there, so the rail is not remounted (and keeps its focus) when a
              // feature turns on or off; only its class changes (a feature's railClass).
              <div className={[styles.railWrap, ...railClasses(active)].join(' ')}>{rail}</div>
            )
          }
          leftPanel={leftPanel ?? undefined}
          leftPanelLabel={leftPanel === null ? undefined : 'office.shell.left_panel'}
          canvas={canvas}
          inspector={inspectorPlace.part ?? undefined}
          inspectorLabel={inspectorPlace.label}
          statusBar={
            <StatusBar
              start={editorStatusStart(screen, features, active, featureCtx, {
                planReady: scale !== null && phase !== null,
                floorSwitcher:
                  session !== null && floors !== null
                    ? () => (
                        <FloorSwitcher store={session.store} floors={floors} canEdit={canEdit} />
                      )
                    : null,
                planStart:
                  scale !== null && phase !== null
                    ? () => (
                        <PlanStatusStart scale={scale} snap={deviceSnapSettings} phase={phase} />
                      )
                    : null,
              })}
              end={editorStatusEnd(
                screen,
                features,
                active,
                featureCtx,
                plan !== null ? () => <PlanStatusEnd handle={plan.handle} /> : null,
              )}
            />
          }
          backdrop={backdrop}
        />
      }
      phone={<LazyNotice name="EditorPhoneNotice" />}
    />
  );
}

// EZD-1910 (editor plan R11, L4): every lazy part below is one `lazyPart` call (shared/lazy-part.tsx); nothing shows
// for the moment a module downloads, and a failed download is tried again the next time the part is wanted.

// EZD-214 (11 Budgets; EZD-120c B11): the inspector panel loads on the first press or key in the editor, or when
// something is selected; until then the empty inspector is drawn from the entry.
const inspectorModule = lazyModule(() => import('../lazy/inspector-panel'));

function useSomethingSelected({ selection }: InspectorPanelProps) {
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().ids.length > 0,
    () => false,
  );
}

function InspectorPlaceholder() {
  return <InspectorEmpty coarse={useCoarsePointer()} />;
}

const LazyInspectorPanel = lazyPart(inspectorModule, 'InspectorPanel', {
  useWanted: useSomethingSelected,
  fallback: InspectorPlaceholder,
  preloadOnFirstInput: true,
});

// EZD-233 (11 Budgets): the tablet edit bar loads on touch screens only.
const editBarModule = lazyModule(() => import('../lazy/edit-bar'));

const LazyEditBar = lazyPart(editBarModule, 'EditBar');

// EZD-233: the menus load when one first opens and then stay (shared/edit-menu-module.ts).
const LazyEditMenus = lazyPart(editMenuModule, 'EditMenus', {
  useWanted: (props) => props.request !== null,
});

// EZD-237: the benchmark runner loads only with `?benchmark=run` (the Benchmark card's frame).
const benchmarkRunnerModule = lazyModule(() => import('../lazy/benchmark-runner'));

const LazyBenchmarkRunner = lazyPart(benchmarkRunnerModule, 'BenchmarkRunner');

// EZD-1985 (Q-0809 (a)): the Fixtures panel in the inspector place, from the module the Fixtures tool loads.
const LazyFixturesPanel = lazyPart(fixturesModule, 'FixturesPanel');

// EZD-612 (11 Budgets): the code check list loads when it is first opened.
const checkPanelModule = lazyModule(() => import('./check/CheckResultsPanel'));

const LazyCheckPanel = lazyPart(checkPanelModule, 'CheckResultsPanel');
