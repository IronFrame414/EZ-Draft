// EZD-1913c (editor plan 5.3 "features plug in"; 2.6 "lock banner / holder prompt / toasts / Stop editing / View only",
// "lock presence"): the edit lock UI as a registry feature, moved unchanged out of ProjectEditor.
// - EZD-126 (S06 Controls; 11 rule 7; vault/build/assumptions.md EZD-126): the edit lock UI (banner, holder prompt,
//   toasts, Stop editing, View only, presence) loads as one lazy module on the first user input, then draws its parts
//   through `LockPart`; until it loads the save-failed banner shows as before. Start editing reopens the editor.
// - EZD-128: the project name opens the project switcher once the lock UI is there; EZD-130: a Project settings save
//   (in the switcher) draws the header again with the new name and client.
// - EZD-225 (S03:17, 143; S06:78; vault/build/assumptions.md EZD-126): the lock UI saw the lock leave this viewer
//   (Release, auto release, their other device, or someone else took it). From then on this editor edits nothing: the
//   drawing controller pauses and every edit path reads `mayEdit` (pausesEdits). Edit model without the lock shows
//   the drawing tools paused with the note under the banner (Q-0740 (a), vault/build/assumptions.md EZD-225).
// Places, as ProjectEditor gave them: header presence and Stop editing; the switcher after the header; the banner and
// the paused note first in the state column after the tablet edit bar (STATE_ORDER); the save banner's place; the
// toasts and prompts last after the state column on every screen (CANVAS_END_ORDER); the lock status at 700.
import { useEffect, useRef, useState } from 'react';
import type { LockPartName, LockUi } from '../../lazy/lock-ui';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import { STATUS_START_ORDER } from '../shared/feature-slots';
import { useStoreValue } from '../shared/use-store-value';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-126 (11 rule 7): the lock UI loads on the first pointer move or press, or the first edit (not on
// pointerover, which a browser fires when the page changes under a resting mouse).
const lockUiModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/lock-ui.messages'),
    import('../../lazy/lock-ui'),
  ),
);

type Loaded = { m: typeof import('../../lazy/lock-ui'); ui: LockUi };

export type LockOwn = {
  /** The lock UI for this session, made once its module is there; null before. */
  readonly lock: Loaded | null;
  /** The lock left this viewer during the session. */
  readonly lockLost: boolean;
};

const noop = () => {};

const ownOf = (ctx: EditorFeatureContext): LockOwn | undefined =>
  ctx.own?.get('lock') as LockOwn | undefined;

/** Edit model and holding the lock now (`viewer.canEdit` is the hold at open, editor-session.ts). */
export function holdsLock(ctx: EditorFeatureContext): boolean {
  return (ctx.ready?.session.model.viewer.canEdit ?? false) && ownOf(ctx)?.lockLost !== true;
}

function useLockOwn(ctx: EditorFeatureContext): LockOwn {
  const t = useT();
  const session = ctx.ready?.session ?? null;
  const plan = ctx.ready?.controllers.plan ?? null;
  const drawing = ctx.ready?.controllers.drawing ?? null;
  const reopen = useRef(ctx.reopen ?? noop);
  useEffect(() => {
    reopen.current = ctx.reopen ?? noop;
  });
  // The lock UI for this session, made once its module is there (at once when it already is). Start editing reopens
  // through `reopen`.
  const [lock, setLock] = useState<Loaded | null>(null);
  useEffect(() => {
    if (session === null || plan === null) return;
    let ui: LockUi | undefined;
    let live = true;
    const start = () => {
      off();
      lockUiModule.load().then((m) => {
        if (!live) return;
        ui = m.createLockUi(
          session,
          plan.captureThumbnail,
          () => reopen.current(),
          t('office.lock.someone'),
        );
        setLock({ m, ui });
      }, noop);
    };
    // The first edit loads it too (a pan right after an edit then makes no React commit, 11 rule 4).
    const offEdit = session.store.subscribe(start);
    const off = () => {
      offEdit();
      removeEventListener('pointermove', start, true);
      removeEventListener('pointerdown', start, true);
    };
    if (lockUiModule.peek()) start();
    else {
      addEventListener('pointermove', start, true);
      addEventListener('pointerdown', start, true);
    }
    return () => {
      live = false;
      off();
      ui?.dispose();
      setLock(null);
    };
  }, [session, plan, t]);
  const lockLost = useStoreValue(
    lock?.ui.store,
    (l) => {
      const s = l.getState();
      return s.loaded && !s.isHolder;
    },
    false,
  );
  // EZD-130: a Project settings save (in the switcher) draws the header again with the new name and client.
  useEffect(() => lock?.ui.switcher.onSaved(() => setLock({ ...lock })), [lock]);
  useEffect(() => {
    if (lockLost) drawing?.pause();
  }, [lockLost, drawing]);
  return { lock, lockLost };
}

/** One of the lock UI's parts, or null while it is not there. */
function part(ctx: EditorFeatureContext, name: LockPartName) {
  const lock = ownOf(ctx)?.lock ?? null;
  return lock && <lock.m.LockPart ui={lock.ui} part={name} />;
}

export const feature: EditorFeature = {
  id: 'lock',
  order: STATUS_START_ORDER.lock,
  active: (ctx) => ctx.ready !== undefined,
  useOwn: useLockOwn,
  pausesEdits: (ctx) => ownOf(ctx)?.lockLost === true,
  headerProps: (ctx) => ({
    // EZD-128: the name opens the project switcher once the lock UI is there.
    onProjectMenu: ownOf(ctx)?.lock?.ui.switcher.toggle,
    presence: part(ctx, 'presence'),
    stopEditing: part(ctx, 'stop'),
  }),
  header: (ctx) => part(ctx, 'switcher'),
  stateItems: [
    { order: 200, part: (ctx) => part(ctx, 'banner') },
    // EZD-225 (Q-0740 (a), vault/build/assumptions.md EZD-225): the note under the banner.
    { order: 210, part: (ctx) => (ctx.toolsPaused === true ? part(ctx, 'paused') : null) },
  ],
  saveBanner: (ctx) => part(ctx, 'save'),
  canvasItems: [{ order: 700, part: (ctx) => part(ctx, 'canvas') }],
  statusStart: (ctx) => part(ctx, 'status'),
};
