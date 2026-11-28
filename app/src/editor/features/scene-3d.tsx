// EZD-1913c (editor plan 5.3 "features plug in"; 2.1 "Header tabs Plan, 3D, Sheets", "3D scene"): the 3D view as a
// registry feature, moved unchanged out of ProjectEditor.
// EZD-1001a (phase-10.md EZD-1001a; S07 Data shown, States; 11 rules 4, 6, 7): the 3D tab, listed once the plan
// canvas is up (Q-0500). Its scene loads as the lazy `scene-3d` module on the first press of 3D, is built from the
// routed store (the model in memory) and kept current per changed object, and is drawn into the plan's one renderer
// (`plan.showScene`), so a tab switch makes no WebGL context. The scene is made on the first press of 3D and kept
// while the session lasts, so a later switch back to 3D draws it at once; it is dropped with the session. Plan's
// overlays, rail, left panel and inspector are off while 3D shows; the canvas region shows the sync footer ("Updating
// from plan" while the scene loads, then "Model synced with plan") and the empty message.
// EZD-2009 (AC-EZD-2009-1): the scene's chunk is downloaded while the editor is idle, after the person's first input.
// EZD-1911: the 3D dev hook and the editor hook's `scene3dLoaded` stay in dev-hooks.ts; this feature gives them the
// scene, whether it shows, and whether its module is in (devParts).
import { useEffect, useState } from 'react';
import type { Scene3d } from '../../lazy/scene-3d';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import { loadAfterFirstInput } from '../plan/scene-warmup';
import { lazyPart } from '../shared/lazy-part';
import styles from './scene-3d.module.css';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-1001a (11 rule 7): the 3D scene loads on the first press of the 3D tab.
const scene3dModule = lazyModule(() => import('../../lazy/scene-3d'));

// EZD-2009: for the editor dev hook (whether the scene module is in).
const scene3dLoaded = () => scene3dModule.peek() !== undefined;

const LazyScene3dOverlay = lazyPart(scene3dModule, 'Scene3dOverlay');

export type Scene3dOwn = { readonly scene: Scene3d | null };

const ownOf = (ctx: EditorFeatureContext): Scene3dOwn | undefined =>
  ctx.own?.get('scene-3d') as Scene3dOwn | undefined;

const shows = (ctx: EditorFeatureContext): boolean =>
  ctx.planUp === true && ctx.chosenView === '3d';

function useScene3dOwn(ctx: EditorFeatureContext): Scene3dOwn {
  const page = ctx.page;
  const controllers = ctx.ready?.controllers;
  const routedStore = controllers?.routed ?? null;
  const phase = controllers?.phase ?? null;
  const floors = controllers?.floors ?? null;
  const plan = controllers?.plan ?? null;
  const [opened, setOpened] = useState(false);
  const [scene, setScene] = useState<Scene3d | null>(null);
  // Each press of 3D opens it (after a failed load, the next press tries again).
  useEffect(
    () =>
      page?.viewPressed.add((v) => {
        if (v === '3d') setOpened(true);
      }),
    [page],
  );
  useEffect(() => {
    if (!opened || routedStore === null || phase === null || floors === null) return;
    let live = true;
    let made: Scene3d | null = null;
    scene3dModule.load().then(
      (m) => {
        if (!live) return;
        made = m.createScene3d({ store: routedStore, phase, floors });
        setScene(made);
      },
      () => {
        // The footer stays on "Updating from plan"; the next press of 3D tries the load again.
        if (live) setOpened(false);
      },
    );
    return () => {
      live = false;
      made?.dispose();
      setScene(null);
    };
  }, [opened, routedStore, phase, floors]);
  const show3d = shows(ctx);
  useEffect(() => {
    if (plan === null) return;
    plan.showScene(show3d ? scene : null);
  }, [plan, show3d, scene]);
  const can3d = ctx.planUp === true;
  useEffect(() => {
    if (!can3d) return;
    return loadAfterFirstInput(() => scene3dModule.preload());
  }, [can3d]);
  return { scene };
}

function SyncFooter({ synced }: { synced: boolean }) {
  const t = useT();
  return (
    <p className={styles.sync3d} data-testid="scene-3d-sync" role="status">
      {t(synced ? 'office.scene3d.synced' : 'office.scene3d.updating')}
    </p>
  );
}

export const feature: EditorFeature = {
  id: 'scene-3d',
  order: 500,
  active: shows,
  useOwn: useScene3dOwn,
  screen: { view: '3d', available: (ctx) => ctx.planUp === true, shows },
  screenCanvas: (ctx) => {
    const scene = ownOf(ctx)?.scene ?? null;
    return (
      <>
        {scene !== null ? <LazyScene3dOverlay scene={scene} /> : null}
        <SyncFooter synced={scene !== null} />
      </>
    );
  },
  devParts: (ctx) => ({ scene3d: ownOf(ctx)?.scene ?? null, show3d: shows(ctx), scene3dLoaded }),
};
