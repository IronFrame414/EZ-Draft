'use client';

// EZD-1999 (performance audit 2026-11-26 F10, Q-0814; AC-EZD-1999-1): the New project wizard loads when it is opened,
// not with the Projects page. Same loading state as the other office dialogs (AvatarMenu's My profile): nothing
// shows for the moment the code downloads; a failed download shows a toast and closes, and the next open tries again.
// Once loaded the module stays cached, so a reopen draws the wizard at once.
import { useEffect, useState, type ReactElement } from 'react';
import { lazyModule, type LazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import { useToast } from '../states/ToastProvider';
import type { NewProjectDialogProps } from '../../lazy/new-project';

export type NewProjectModule = typeof import('../../lazy/new-project');

export const newProjectModule: LazyModule<NewProjectModule> = lazyModule(() =>
  withScreenMessages(import('../../lib/messages/screens/new-project.messages'), import('../../lazy/new-project')),
);

export function NewProjectLoader(
  props: NewProjectDialogProps & { module?: LazyModule<NewProjectModule> },
): ReactElement | null {
  const { module: lazy = newProjectModule, ...dialogProps } = props;
  const { onClose } = dialogProps;
  const toast = useToast();
  const [mod, setMod] = useState(() => lazy.peek());
  useEffect(() => {
    if (mod) return;
    let live = true;
    lazy.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {
        if (!live) return;
        toast.show({ message: 'office.new_project.load_failed' });
        onClose();
      },
    );
    return () => {
      live = false;
    };
  }, [mod, lazy, toast, onClose]);
  if (!mod) return null;
  return <mod.NewProjectDialog {...dialogProps} />;
}
