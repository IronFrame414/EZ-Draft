// EZD-134 (11 Offline "cached by the service worker after first load"): after a load the page tells the worker
// which page and which files it loaded, now and as more load, so the worker stores them (sw-rules.mjs
// onWarmMessage) and trims the project cache. The worker does the fetching, so the page makes no extra request.
// Only a page the device keeps a copy of (shell or project page) does: sign-in, auth links, invites and dev pages
// need the network, so they start no worker fetches (a worker stopped with those in flight took Chromium down,
// traffic.spec.ts R1). Also asks for persistent storage (03b Architecture rule 10). Never throws.
import { appBuild } from '../app-version';
import { requestPersistentStorage } from './device-storage';
import { WARM_MESSAGE } from './sw-constants.mjs';
import { isProjectPath, isShellPath } from './sw-rules.mjs';

export type WarmData = {
  type: typeof WARM_MESSAGE;
  build: number;
  page: string | null;
  files: string[];
  openProject: string | null;
};

// Files the page loaded itself; fetches (the app's API reads) are left out.
export function loadedFiles(entries: readonly PerformanceEntry[]): string[] {
  return entries
    .filter((e) => {
      const kind = (e as PerformanceResourceTiming).initiatorType;
      return kind !== 'fetch' && kind !== 'xmlhttprequest' && kind !== 'beacon';
    })
    .map((e) => e.name);
}

// The open project of a page path, if it is a project page.
export function openProjectOf(pathname: string): string | null {
  const m = /^\/projects\/([0-9a-f-]{36})(\/|$)/i.exec(pathname);
  return m ? m[1] : null;
}

export function warmData(
  location: Pick<Location, 'href' | 'pathname'>,
  files: string[],
  withPage: boolean,
  build: number = appBuild(),
): WarmData {
  return {
    type: WARM_MESSAGE,
    build,
    page: withPage ? location.href : null,
    files,
    openProject: openProjectOf(location.pathname),
  };
}

type Worker = Pick<ServiceWorker, 'postMessage'>;

export async function startWarm(
  ready: Promise<{ active: Worker | null }> = navigator.serviceWorker.ready,
): Promise<void> {
  try {
    const worker = (await ready).active;
    const { pathname } = window.location;
    if (worker && (isShellPath(pathname) || isProjectPath(pathname))) {
      worker.postMessage(
        warmData(window.location, loadedFiles(performance.getEntriesByType('resource')), true),
      );
      // Files that load later (lazy parts) are named as they arrive.
      new PerformanceObserver((list) => {
        const files = loadedFiles(list.getEntries());
        if (files.length > 0) worker.postMessage(warmData(window.location, files, false));
      }).observe({ type: 'resource' });
    }
  } catch {
    // no worker or no PerformanceObserver: what loads is stored after a later load
  }
  await requestPersistentStorage();
}
