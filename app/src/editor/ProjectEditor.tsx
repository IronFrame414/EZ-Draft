'use client';
// EZD-120c Build step 6 (vault/plans/EZD-120c.md section 3; Decided "Open", "Frame", "Header", "Canvas", "Test
// hook", "Report, dispose"; Q-0500; Q-0214; Q-0501; Q-0505; Q-0506): the editor for one project. The frame has no
// rail, panels or status items yet; the canvas area shows loading, a failed load with Retry, no access, not
// found, or, for an editor, the offline and save-failed banners. The header names the project and, for an editor,
// whether the work is saved.
// EZD-207a Build step 16 (vault/plans/EZD-207a.md Decided "Editor wiring", "Test hook"; Q-0568; Q-0500; Q-0214):
// ready, the plan canvas fills the frame behind the cards and the Plan tab is the one view; a canvas that cannot
// start shows an inline error with Retry.
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { DeviceLayout } from '../components/device/DeviceLayout';
import { EditorPhoneNotice } from '../components/phone/EditorPhoneNotice';
import { EditorFrame } from '../components/shell/EditorFrame';
import { EditorHeader } from '../components/shell/EditorHeader';
import type { EditorView } from '../components/shell/editor-views';
import { HeaderCard } from '../components/shell/HeaderCard';
import { StatusBar } from '../components/shell/StatusBar';
import { Wordmark } from '../components/shell/Wordmark';
import { InlineError } from '../components/states/InlineError';
import { NoAccess } from '../components/states/NoAccess';
import { OfflineBanner } from '../components/states/OfflineBanner';
import { Skeleton, SkeletonGroup } from '../components/states/Skeleton';
import { useT } from '../lib/messages';
import type { ObjectValue } from '../lib/outbox/model-api';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from './editor-session';
import type { Change } from './model/patches';
import {
  createPlanController,
  type PlanCanvasHandle,
  type PlanController,
} from './plan/controller';
import { PlanCanvas, PlanInputSurface } from './plan/PlanCanvas';
import { createR3fRoot, webglContextsCreated } from './plan/render-root';
import { SaveFailedBanner, SaveStateText } from './SaveStatus';
import styles from './ProjectEditor.module.css';

// EZD-120d: `openDeps` is passed to openEditorSession (the test page injects a fault into the save); `onSession`
// is told when the session is ready, then null when it is disposed.
export type ProjectEditorProps = {
  projectId: string;
  devHooks: boolean;
  openDeps?: OpenDeps;
  onSession?: (session: EditorSession | null) => void;
};

export type EditorTestHook = {
  objects(): Array<{ id: string } & ObjectValue>;
  edit(changes: Change[]): string[];
};

type PlanTestHook = {
  handle: PlanCanvasHandle;
  stats(): { frames: number; drawCalls: number; bufferUploads: number; contexts: number };
};

type CanvasState =
  | { kind: 'loading' }
  | Exclude<OpenResult, { kind: 'ready' }>
  | { kind: 'ready'; session: EditorSession; plan: PlanController };

const PLAN_VIEWS: EditorView[] = ['plan'];
const noop = () => {};

export function ProjectEditor({
  projectId,
  devHooks,
  openDeps,
  onSession,
}: ProjectEditorProps): ReactElement {
  const t = useT();
  const [state, setState] = useState<CanvasState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [canvasAttempt, setCanvasAttempt] = useState(0);
  const openDepsRef = useRef(openDeps);
  const onSessionRef = useRef(onSession);
  useEffect(() => {
    openDepsRef.current = openDeps;
    onSessionRef.current = onSession;
  });

  useEffect(() => {
    let live = true;
    let dispose: (() => void) | null = null;
    void openEditorSession(projectId, openDepsRef.current).then((result) => {
      if (!live) {
        if (result.kind === 'ready') result.session.dispose();
        return;
      }
      if (result.kind === 'ready') {
        const plan = createPlanController(
          { store: result.session.store },
          { createRoot: createR3fRoot },
        );
        dispose = () => {
          plan.dispose();
          result.session.dispose();
          onSessionRef.current?.(null);
        };
        onSessionRef.current?.(result.session);
        setState({ kind: 'ready', session: result.session, plan });
        return;
      }
      setState(result);
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [projectId, attempt]);

  const session = state.kind === 'ready' ? state.session : null;
  const plan = state.kind === 'ready' ? state.plan : null;
  const sync = session?.sync ?? null;

  useEffect(() => {
    if (session === null || sync === null || !devHooks) return;
    const store = session.store;
    const hook: EditorTestHook = {
      objects: () => [...store.getState().objects].map(([id, value]) => ({ id, ...value })),
      edit: (changes) => store.applyEdit(changes),
    };
    const w = window as unknown as { __ezdraftEditor?: EditorTestHook };
    w.__ezdraftEditor = hook;
    return () => {
      delete w.__ezdraftEditor;
    };
  }, [session, sync, devHooks]);

  useEffect(() => {
    if (plan === null || !devHooks) return;
    const hook: PlanTestHook = {
      handle: plan.handle,
      stats: () => ({ ...plan.stats(), contexts: webglContextsCreated() }),
    };
    const w = window as unknown as { __ezdraftPlan?: PlanTestHook };
    w.__ezdraftPlan = hook;
    return () => {
      delete w.__ezdraftPlan;
    };
  }, [plan, devHooks]);

  const workingCopy = t('office.editor.working_copy');
  const clientName = session?.model.project.clientName ?? null;
  const subtitle = useMemo(
    () => [clientName, workingCopy, sync ? <SaveStateText sync={sync} /> : null],
    [clientName, workingCopy, sync],
  );

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const header =
    session === null ? (
      <HeaderCard>
        <Wordmark href="/" />
      </HeaderCard>
    ) : (
      <EditorHeader
        projectsHref="/"
        projectName={session.model.project.name}
        subtitle={subtitle}
        activeView="plan"
        views={PLAN_VIEWS}
        onViewChange={noop}
      />
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
    body = <NoAccess />;
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
    body = (
      <>
        {sync !== null ? (
          <>
            <OfflineBanner message="office.editor.offline" />
            <SaveFailedBanner sync={sync} />
          </>
        ) : null}
        {canvasFailed ? (
          <InlineError message="office.plan.canvas_failed" onRetry={retryCanvas} />
        ) : null}
      </>
    );
  }

  const stateArea = (
    <div className={styles.state} data-testid="editor-state" data-editor-state={state.kind}>
      {body}
    </div>
  );
  const showPlan = plan !== null && !canvasFailed;
  const canvas = showPlan ? (
    <>
      <PlanInputSurface controller={plan} />
      {stateArea}
    </>
  ) : (
    stateArea
  );
  const backdrop = showPlan ? (
    <PlanCanvas key={canvasAttempt} controller={plan} onFailed={() => setCanvasFailed(true)} />
  ) : undefined;

  return (
    <DeviceLayout
      full={
        <EditorFrame
          header={header}
          rail={null}
          canvas={canvas}
          statusBar={<StatusBar />}
          backdrop={backdrop}
        />
      }
      phone={<EditorPhoneNotice />}
    />
  );
}
