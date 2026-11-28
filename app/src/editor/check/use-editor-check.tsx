// EZD-1914 (editor plan 5.2): the code check's wiring on the editor page, moved unchanged out of ProjectEditor.
// EZD-612 (S03 Check; S06 Check, Check status pill; 04 Tool rail "Check | Shift+C"): the code check on a loaded
// editor. It flushes unsaved edits first, so the check reads what is on screen. The company's Check key runs it, and
// Go to (S03 "click a warning to zoom to the object") selects the object and zooms to it; a hidden phase is shown.
import { useCallback, useEffect, type ReactNode } from 'react';
import { commandForKey, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { EditorSession } from '../editor-session';
import type { EditorControllers } from '../session/create-controllers';
import { lazyPart } from '../shared/lazy-part';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { CheckPill } from './CheckPill';
import { useCodeCheck } from './use-code-check';

// EZD-612 (11 Budgets): the code check list loads when it is first opened.
const checkPanelModule = lazyModule(() => import('./CheckResultsPanel'));

const LazyCheckPanel = lazyPart(checkPanelModule, 'CheckResultsPanel');

export type EditorCheckDeps = {
  readonly projectId: string;
  readonly ready: boolean;
  readonly session: EditorSession | null;
  readonly bindings: ShortcutBindings;
  readonly plan: EditorControllers['plan'] | null;
  readonly layers: EditorControllers['layers'] | null;
  readonly selection: EditorControllers['selection'] | null;
};

export type EditorCheck = {
  /** The Check pill and, while open, the results list; null while the check is not shown. */
  readonly parts: ReactNode;
  /** The Check key and the rail's Check are on. */
  readonly keyOn: boolean;
  readonly runCheck: () => void;
};

export function useEditorCheck({
  projectId,
  ready,
  session,
  bindings,
  plan,
  layers,
  selection,
}: EditorCheckDeps): EditorCheck {
  const sync = session?.sync ?? null;
  const flushEdits = useCallback(async () => {
    await sync?.flush();
  }, [sync]);
  const codeCheck = useCodeCheck({
    projectId,
    enabled: ready,
    store: session?.store ?? null,
    flush: flushEdits,
  });
  const runCheck = codeCheck.runCheck;
  const keyOn = ready && codeCheck.canRun;
  useEffect(() => {
    if (!keyOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'check') return;
      e.preventDefault();
      runCheck();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyOn, bindings, runCheck]);
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
  const parts =
    ready && (codeCheck.canRun || codeCheck.run !== null) ? (
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
  return { parts, keyOn, runCheck };
}
