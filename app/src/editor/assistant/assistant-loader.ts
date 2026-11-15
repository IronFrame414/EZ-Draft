// EZD-5604b (11 Budgets; EZD-120c B11 editor route within 500,000 compressed bytes; vault/build/assumptions.md
// EZD-5604b): the Assistant session loads with the panel's lazy module when the rail button is first pressed. Until
// then the editor holds only this loader: the button reads `isOpen`, the panel reads `getSession`, the canvas reads
// `getPreview`. A failed download changes nothing; the next press tries again. No React.
import type { AssistantSession, AssistantSessionDeps } from './assistant-session';
import type { PreviewStore } from './preview-store';

export type AssistantLoader = {
  subscribe(listener: () => void): () => void;
  isOpen(): boolean;
  getSession(): AssistantSession | null;
  getPreview(): PreviewStore | null;
  toggle(): void;
  dispose(): void;
};

export type AssistantSessionModule = {
  createAssistantSession(deps: AssistantSessionDeps): AssistantSession;
};

export function createAssistantLoader(
  deps: AssistantSessionDeps,
  load: () => Promise<AssistantSessionModule>,
): AssistantLoader {
  let session: AssistantSession | null = null;
  let loading = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isOpen: () => session?.getUi().open ?? false,
    getSession: () => session,
    getPreview: () => session?.getPreview() ?? null,
    toggle() {
      if (disposed) return;
      if (session !== null) {
        session.toggle();
        return;
      }
      if (loading) return;
      loading = true;
      load().then(
        (m) => {
          loading = false;
          if (disposed) return;
          const made = m.createAssistantSession(deps);
          session = made;
          made.subscribe(notify);
          made.setOpen(true);
          notify();
        },
        () => {
          loading = false;
        },
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      session?.dispose();
      session = null;
    },
  };
}
