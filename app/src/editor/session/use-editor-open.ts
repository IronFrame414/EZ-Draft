// EZD-1914 (editor plan 5.2 job 1): opening the editor's session, moved unchanged out of ProjectEditor.
// EZD-120c (vault/plans/EZD-120c.md Decided "Open", "Report, dispose"): the session opens for the project; a failed
// load, no access or not found is the state; Retry (and a feature's reopen) opens a new session and store, so undo is
// cleared. EZD-120d: `openDeps` is passed to openEditorSession (the test page injects a fault into the save);
// `onSession` is told when the session is ready, then null when it is disposed.
// EZD-116 (AC-EZD-116-8): the session re-reads the defaults on the project channel resync.
// EZD-1401 (11 Offline): the model load goes through the project cache (stored online, read-only from the copy
// offline). EZD-1912: the controllers are built and disposed in session/create-controllers.ts.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { createProjectCache } from '../../lib/pwa/project-cache';
import type { MessageKey } from '../../server/messages/catalog';
import {
  openEditorSession,
  type EditorSession,
  type OpenDeps,
  type OpenResult,
} from '../editor-session';
import { hubResync } from '../project-defaults';
import type { FeaturePage } from '../shared/feature-page';
import { createControllers, type EditorControllers } from './create-controllers';

export type EditorOpenState =
  | { kind: 'loading' }
  | Exclude<OpenResult, { kind: 'ready' }>
  | ({ kind: 'ready'; session: EditorSession } & EditorControllers);

export type EditorOpenDeps = {
  readonly projectId: string;
  readonly openDeps: OpenDeps | undefined;
  readonly onSession: ((session: EditorSession | null) => void) | undefined;
  readonly page: FeaturePage;
  readonly projectCache: ReturnType<typeof createProjectCache>;
  /** Shows a toast with the message (read when a controller reports one). */
  readonly messageRef: RefObject<(key: MessageKey) => void>;
};

export function useEditorOpen({
  projectId,
  openDeps,
  onSession,
  page,
  projectCache,
  messageRef,
}: EditorOpenDeps): { readonly state: EditorOpenState; readonly retry: () => void } {
  const [state, setState] = useState<EditorOpenState>({ kind: 'loading' });
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
  }, [projectId, attempt, page, projectCache, messageRef]);

  // Retry and a feature's reopen: a new session (it only sets state, so it is the same function on every render).
  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
