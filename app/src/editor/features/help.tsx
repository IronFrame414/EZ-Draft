// EZD-1913c (editor plan 5.3 "features plug in"; 2.6): the Help panel as a registry feature, moved unchanged out of
// ProjectEditor. EZD-222 (S03 Help; S15d Keyboard shortcuts): the Help panel, opened by the rail button or the Help
// key on a loaded editor; the rail's Help button shows the company's key for it. The panel draws after the state
// column on every screen (CANVAS_END_ORDER: after the conflict list and the code check, before the lock's prompts).
import { useCallback, useEffect, useState } from 'react';
import { commandForKey } from '../../lib/defaults/shortcut-keys';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import { shortcutText } from '../help/rail-keys';
import type { ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import { lazyPart } from '../shared/lazy-part';
import { editorDefaults, useDefault } from '../shared/use-default';
import { isTypingTarget } from '../typed-entry/typed-entry';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-222 (11 Budgets): the Help panel loads when Help is first opened.
const helpPanelModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/help-panel.messages'),
    import('../../lazy/help-panel'),
  ),
);

const LazyHelpPanel = lazyPart(helpPanelModule, 'HelpPanel');

export type HelpOwn = {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** Closes the panel (the same function on every render). */
  readonly close: () => void;
  /** The company's key map (EZD-222), re-read on every defaults resync; the defaults' while none is open. */
  readonly bindings: ShortcutBindings;
};

const ownOf = (ctx: EditorFeatureContext): HelpOwn | undefined =>
  ctx.own?.get('help') as HelpOwn | undefined;

function useHelpOwn(ctx: EditorFeatureContext): HelpOwn {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ready = ctx.ready !== undefined;
  const bindings = useDefault(ctx.defaults, editorDefaults.keyboardShortcuts);
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'help') return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, bindings]);
  return { open, setOpen, close, bindings };
}

export const feature: EditorFeature = {
  id: 'help',
  order: 600,
  // On an open editor; an open panel stays open while the editor reopens.
  active: (ctx) => ctx.ready !== undefined || ownOf(ctx)?.open === true,
  useOwn: useHelpOwn,
  railProps: (ctx) => {
    const own = ownOf(ctx);
    if (ctx.ready === undefined || own === undefined) return { help: null };
    return {
      help: { shortcut: shortcutText(ctx.ready.bindings, 'help'), onOpen: () => own.setOpen(true) },
    };
  },
  canvasItems: [
    {
      order: 600,
      part: (ctx) => {
        const own = ownOf(ctx);
        return own?.open === true ? (
          <LazyHelpPanel bindings={own.bindings} onClose={own.close} />
        ) : null;
      },
    },
  ],
};
