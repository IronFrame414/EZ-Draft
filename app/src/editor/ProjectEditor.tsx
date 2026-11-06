'use client';
// EZD-120c Build step 6 (vault/plans/EZD-120c.md section 3; Decided "Open", "Frame", "Header", "Canvas", "Test
// hook", "Report, dispose"; Q-0500; Q-0214; Q-0501; Q-0505; Q-0506): the editor for one project. The frame has no
// rail, panels or status items yet; the canvas area shows loading, a failed load with Retry, no access, not
// found, or, for an editor, the offline and save-failed banners. The header names the project and, for an editor,
// whether the work is saved.
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
import { openEditorSession, type EditorSession, type OpenDeps, type OpenResult } from './editor-session';
import type { Change } from './model/patches';
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

type CanvasState = { kind: 'loading' } | OpenResult;

const NO_VIEWS: EditorView[] = [];
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
        dispose = () => {
          result.session.dispose();
          onSessionRef.current?.(null);
        };
        onSessionRef.current?.(result.session);
      }
      setState(result);
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [projectId, attempt]);

  const session = state.kind === 'ready' ? state.session : null;
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
        views={NO_VIEWS}
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
  } else if (sync !== null) {
    body = (
      <>
        <OfflineBanner message="office.editor.offline" />
        <SaveFailedBanner sync={sync} />
      </>
    );
  }

  const canvas = (
    <div className={styles.state} data-testid="editor-state" data-editor-state={state.kind}>
      {body}
    </div>
  );

  return (
    <DeviceLayout
      full={<EditorFrame header={header} rail={null} canvas={canvas} statusBar={<StatusBar />} />}
      phone={<EditorPhoneNotice />}
    />
  );
}
