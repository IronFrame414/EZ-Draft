// EZD-612 (S06 Check status pill; S03 Check; AC-EZD-612-1..3): the editor's code check state. Once the editor is
// ready it reads the latest run and what the member may do (GET); Check flushes unsaved edits, then runs (POST) and
// opens the list; Accept with note saves one acceptance (PATCH). Any model change after the run turns the pill grey
// ("Check not run") until Check runs again, as does a save after the stored run (the read says so). A failed read leaves no button and no pill; it is never retried on its own.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelStore } from '../model/model-store';
import { acceptWarning, readCodeCheck, runCodeCheckNow } from './check-client';
import type { CodeCheckRun } from './check-status';

export type CodeCheckState = {
  status: 'loading' | 'running' | 'failed' | 'ready';
  run: CodeCheckRun | null;
  canRun: boolean;
  canAccept: boolean;
  changedSinceRun: boolean;
  open: boolean;
};

export type CodeCheck = CodeCheckState & {
  runCheck: () => void;
  accept: (item: { ruleId: string; objectId: string; note: string }) => Promise<boolean>;
  close: () => void;
  show: () => void;
};

const INITIAL: CodeCheckState = {
  status: 'loading',
  run: null,
  canRun: false,
  canAccept: false,
  changedSinceRun: false,
  open: false,
};

export function useCodeCheck(o: {
  projectId: string;
  enabled: boolean;
  store: ModelStore | null;
  // Sends edits not yet saved, so the check reads what is on screen.
  flush?: () => Promise<void>;
}): CodeCheck {
  const { projectId, enabled, store, flush } = o;
  const [state, setState] = useState<CodeCheckState>(INITIAL);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    void readCodeCheck(projectId).then((out) => {
      if (!on) return;
      setState((s) =>
        out.ok
          ? {
              ...s,
              status: 'ready',
              run: out.answer.run,
              canRun: out.answer.canRun,
              canAccept: out.answer.canAccept,
              changedSinceRun: s.changedSinceRun || out.answer.changedSinceRun === true,
            }
          : { ...s, status: 'ready' },
      );
    });
    return () => {
      on = false;
    };
  }, [projectId, enabled]);

  // A model change after the run: the pill reads "Check not run".
  useEffect(() => {
    if (store === null) return;
    let objects = store.getState().objects;
    return store.subscribe((next) => {
      if (next.objects === objects) return;
      objects = next.objects;
      setState((s) => (s.run === null || s.changedSinceRun ? s : { ...s, changedSinceRun: true }));
    });
  }, [store]);

  const runCheck = useCallback(() => {
    setState((s) => ({ ...s, status: 'running', open: true }));
    void (async () => {
      try {
        await flush?.();
      } catch {
        // The check reads what is saved; a failed flush still checks the rest.
      }
      const out = await runCodeCheckNow(projectId);
      if (!live.current) return;
      setState((s) =>
        out.ok
          ? {
              ...s,
              status: 'ready',
              run: out.answer.run,
              canRun: out.answer.canRun,
              canAccept: out.answer.canAccept,
              changedSinceRun: false,
            }
          : { ...s, status: 'failed' },
      );
    })();
  }, [projectId, flush]);

  const accept = useCallback(
    async (item: { ruleId: string; objectId: string; note: string }) => {
      const runId = state.run?.runId;
      if (runId === undefined) return false;
      const out = await acceptWarning(projectId, { runId, ...item });
      if (!out.ok || !live.current) return false;
      setState((s) => ({ ...s, run: out.answer.run }));
      return true;
    },
    [projectId, state.run?.runId],
  );

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const show = useCallback(() => setState((s) => ({ ...s, open: true })), []);

  return { ...state, runCheck, accept, close, show };
}
