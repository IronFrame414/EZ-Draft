// EZD-1911 (editor consolidation plan vault/plans/editor-consolidation-2026-11-23.md 5.2 job 6; section 2.6): the
// editor's dev and test hooks, moved here from ProjectEditor unchanged. With `devHooks` on (the page turns it on off
// production; the save bench always), the editor puts `window.__ezdraftEditor`, `__ezdraftPlan`,
// `__ezdraftSelection` and `__ezdraft3d` up once their parts are ready and takes each away when its parts go. Many
// e2e specs read them, so their names and members must not change.
// EZD-224b (Q-0681 (a)): `__ezdraftEditor.checkpoint()` flushes the save and makes the project's thumbnail.
import { useEffect } from 'react';
import type { Scene3d, Scene3dStats } from '../lazy/scene-3d';
import type { ObjectValue } from '../lib/outbox/model-api';
import type { EditorSession } from './editor-session';
import type { Change } from './model/patches';
import type { PlanCanvasHandle, PlanController, PlanStats } from './plan/controller';
import { webglContextsCreated } from './plan/render-root';
import type { SelectionController } from './selection/selection-controller';
import type { PhaseSetting } from './status/phase-setting';
import type { CheckpointOutcome } from './thumbnail/checkpoint';

export type EditorTestHook = {
  objects(): Array<{ id: string } & ObjectValue>;
  edit(changes: Change[]): string[];
  checkpoint(): Promise<CheckpointOutcome>;
  // EZD-2009: true once the lazy `scene-3d` module is downloaded and ready (before or after 3D is pressed).
  scene3dLoaded(): boolean;
};

export type PlanTestHook = {
  handle: PlanCanvasHandle;
  stats(): PlanStats & { contexts: number };
  // EZD-214: the phase view and the Phase eyes (EZD-218 drives setEye from Layers).
  phase: PhaseSetting;
  // EZD-304: the plan positions of the PDF underlay's corners, or null.
  underlay(): ReturnType<PlanController['underlay']>;
  // EZD-502: the surface drawn and its batches.
  drawn(): ReturnType<PlanController['drawn']>;
  // EZD-513: the text items drawn, with their object ids.
  drawnTexts(): ReturnType<PlanController['drawnTexts']>;
};

export type SelectionTestHook = {
  ids(): string[];
  hoveredId(): string | null;
};

export type Scene3dTestHook = { stats(): Scene3dStats & { contexts: number; shown: boolean } };

export type DevHookWindow = {
  __ezdraftEditor?: EditorTestHook;
  __ezdraftPlan?: PlanTestHook;
  __ezdraftSelection?: SelectionTestHook;
  __ezdraft3d?: Scene3dTestHook;
};

type Sync = NonNullable<EditorSession['sync']>;

// Each install puts one hook on `w` and returns the function that takes it away.
export function installEditorHook(
  w: DevHookWindow,
  o: { session: EditorSession; sync: Sync; plan: PlanController; projectId: string; scene3dLoaded: () => boolean },
): () => void {
  const { session, sync, plan, projectId, scene3dLoaded } = o;
  const store = session.store;
  const hook: EditorTestHook = {
    objects: () => [...store.getState().objects].map(([id, value]) => ({ id, ...value })),
    edit: (changes) => store.applyEdit(changes),
    checkpoint: async () => {
      await sync.flush();
      const { makeCheckpoint } = await import('./thumbnail/checkpoint');
      return makeCheckpoint({ projectId, capture: () => plan.captureThumbnail() });
    },
    scene3dLoaded,
  };
  w.__ezdraftEditor = hook;
  return () => {
    delete w.__ezdraftEditor;
  };
}

export function installPlanHook(w: DevHookWindow, o: { plan: PlanController; phase: PhaseSetting }): () => void {
  const { plan, phase } = o;
  const hook: PlanTestHook = {
    handle: plan.handle,
    stats: () => ({ ...plan.stats(), contexts: webglContextsCreated() }),
    phase,
    underlay: () => plan.underlay(),
    drawn: () => plan.drawn(),
    drawnTexts: () => plan.drawnTexts(),
  };
  w.__ezdraftPlan = hook;
  return () => {
    delete w.__ezdraftPlan;
  };
}

export function installSelectionHook(
  w: DevHookWindow,
  o: { selection: SelectionController; plan: PlanController },
): () => void {
  const { selection, plan } = o;
  const hook: SelectionTestHook = {
    ids: () => [...selection.getUi().ids],
    hoveredId: () => plan.handle.getHoveredId(),
  };
  w.__ezdraftSelection = hook;
  return () => {
    delete w.__ezdraftSelection;
  };
}

export function install3dHook(w: DevHookWindow, o: { scene3d: Scene3d; shown: boolean }): () => void {
  const { scene3d, shown } = o;
  const hook: Scene3dTestHook = {
    stats: () => ({ ...scene3d.stats(), contexts: webglContextsCreated(), shown }),
  };
  w.__ezdraft3d = hook;
  return () => {
    delete w.__ezdraft3d;
  };
}

export type DevHookParts = {
  devHooks: boolean;
  projectId: string;
  session: EditorSession | null;
  sync: Sync | null;
  plan: PlanController | null;
  phase: PhaseSetting | null;
  selection: SelectionController | null;
  scene3d: Scene3d | null;
  show3d: boolean;
  // EZD-2009: whether the lazy `scene-3d` module has loaded. The same function on every render.
  scene3dLoaded: () => boolean;
};

// The editor's one call: each hook is put up when `devHooks` is on and its parts are ready, with the same
// dependencies ProjectEditor's effects had.
export function useDevHooks(p: DevHookParts): void {
  const { devHooks, projectId, session, sync, plan, phase, selection, scene3d, show3d, scene3dLoaded } = p;
  useEffect(() => {
    if (plan === null || scene3d === null || !devHooks) return;
    return install3dHook(window as DevHookWindow, { scene3d, shown: show3d });
  }, [plan, scene3d, show3d, devHooks]);
  useEffect(() => {
    if (session === null || sync === null || plan === null || !devHooks) return;
    return installEditorHook(window as DevHookWindow, { session, sync, plan, projectId, scene3dLoaded });
  }, [session, sync, plan, devHooks, projectId, scene3dLoaded]);
  useEffect(() => {
    if (plan === null || phase === null || !devHooks) return;
    return installPlanHook(window as DevHookWindow, { plan, phase });
  }, [plan, phase, devHooks]);
  useEffect(() => {
    if (selection === null || plan === null || !devHooks) return;
    return installSelectionHook(window as DevHookWindow, { selection, plan });
  }, [selection, plan, devHooks]);
}
