'use client';
// EZD-120c (vault/plans/EZD-120c.md section 3): the editor for one project. It opens the session, then maps every slot
// of the frame from the registry features (features/index.generated.ts) through shared/feature-slots.tsx; it names
// none of them. Every edit path reads `mayEdit` (EZD-225); the dev hooks keep their names (dev-hooks.ts). The
// per-ticket history of this file is in git; each part below names the ticket it comes from.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { DeviceLayout } from '../components/device/DeviceLayout';
import { railToolsWithKeys, shortcutText } from './help/rail-keys';
import { useRailOrder } from './tools/use-rail-order';
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
import type { EditorSession, OpenDeps } from './editor-session';
import { InspectorMore, InspectorStack } from './edit/InspectorMore';
import { useCanvasMenu } from './edit/use-canvas-menu';
import { EmptyPlanHint } from './EmptyPlanHint';
import {
  LazyBenchmarkRunner,
  LazyEditBar,
  LazyEditMenus,
  LazyFixturesPanel,
  LazyInspectorPanel,
} from './editor-lazy-parts';
import { FloorSwitcher } from './floors/FloorSwitcher';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { PlanTextFailedBanner } from './plan/PlanTextFailedBanner';
import { usePdfUnderlay } from './plan/PdfUnderlay';
import { ZoomStack } from './plan/ZoomStack';
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
import { DrawingLayer, DrawingRail } from './tools/DrawingTools';
import { useEditorCheck } from './check/use-editor-check';
import { useDevHooks } from './dev-hooks';
import { useEditorOpen } from './session/use-editor-open';
import { features } from './features/index.generated';
import type { EditorFeatureContext, FeatureProps, FeatureReady } from './features/types';
import { LazyNotice } from './shared/editor-notices';
import { createFeaturePage } from './shared/feature-page';
import {
  CANVAS_END_ORDER,
  editorInspector,
  editorLeftPanel,
  editorStatusEnd,
  editorStatusStart,
  editorViews,
  featureDevParts,
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
  STATE_ORDER,
} from './shared/feature-slots';
import { useEditorFeatures } from './shared/use-editor-features';
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
  // EZD-1913b: what the plan's features share for this page (the plan's surface first, EZD-502). EZD-505: made before
  // the session, which selection reads. EZD-1913c: the header tab chosen starts at the page's.
  const [page] = useState(() => createFeaturePage(props.initialView));
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  // EZD-1401 (11 Offline): this page's copy of the open project's data, and the header icon's state.
  // One per project, so another project's stored state never shows.
  const projectCache = useMemo(() => createProjectCache(), [projectId]);
  const messageRef = useRef<(key: MessageKey) => void>(noop);
  const toast = useToast();
  useEffect(() => {
    messageRef.current = (key) => toast.show({ message: key });
  }, [toast]);

  // EZD-120c: the session for the project, opened again on Retry (session/use-editor-open.ts).
  const { state, retry } = useEditorOpen({
    projectId,
    openDeps,
    onSession,
    page,
    projectCache,
    messageRef,
  });

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
  // EZD-230 (Q-0038, Q-0122): the user's own rail tool order (tools/use-rail-order.ts).
  const railMessage = useCallback((key: MessageKey) => messageRef.current(key), []);
  const [railOrder, onRailReorder] = useRailOrder(initialRailOrder, railMessage);
  const editorReady = state.kind === 'ready';
  // EZD-612 (S03 Check): the code check on a loaded editor, its key and its parts (check/use-editor-check.tsx).
  const {
    runCheck,
    keyOn: checkKeyOn,
    parts: checkParts,
  } = useEditorCheck({ projectId, ready: editorReady, session, bindings, plan, layers, selection });

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
  // EZD-1913a to EZD-1913c: the features' context, whether this viewer may edit now, and the features on now
  // (shared/use-editor-features.ts).
  const { mayEdit, spec, featureCtx, active, screenOn, limited, quiet, screen, covered } =
    useEditorFeatures(baseCtx, holdsAtOpen, (canEditNow) =>
      editorRail({
        editor: state.kind,
        canEdit: canEditNow,
        canEditModel: session?.lock.canEditModel,
        canvasFailed,
        controllerEnabled: drawing?.getUi().enabled ?? false,
      }),
    );
  const canEdit = mayEdit;
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

  // EZD-233: the context menu and the More menu (edit/use-canvas-menu.ts).
  const menuDeps = { plan, selection, drawing, session, canEdit: mayEdit, limited };
  const { menu, setMenu, closeMenu } = useCanvasMenu(menuDeps);

  const clientName = session?.model.project.clientName ?? null;
  // The header subtitle: the client, a feature's middle item, the save state.
  const subtitleMiddle = featureSlot(active, 'headerSubtitle', featureCtx);
  const subtitle = useMemo(
    () => [clientName, subtitleMiddle, sync ? <SaveStateText sync={sync} /> : null],
    [clientName, subtitleMiddle, sync],
  );

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
