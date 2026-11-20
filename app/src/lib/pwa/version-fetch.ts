// EZD-134 (03b Architecture rule 12 "Every request carries the app version. A device running an older version
// finishes draining its outbox and is then told to reload"; Q-0530; Q-0540): every same-origin fetch from the
// page carries this build's number in `x-ezdraft-app-build`; the request gate (proxy.ts) answers every request
// with the server's build in the same header. An answer from a newer build to a request other than a save marks
// this page outdated; the reload prompt waits for the outbox to empty (ReloadPrompt.tsx). Saves keep their own
// refusal and prompt (EZD-299, Q-0540). Page loads cannot carry a header; they are new pages of the server's build.
import { APP_BUILD_HEADER, appBuild } from '../app-version';

const BUILD = /^[0-9]{1,15}$/;

// The save route: POST /api/projects/<id>/objects (EZD-299 handles its version refusal).
export function isSaveRequest(method: string, url: URL): boolean {
  return method.toUpperCase() === 'POST' && /^\/api\/projects\/[^/]+\/objects\/?$/.test(url.pathname);
}

// True when the answer names a build newer than this one.
export function isNewerBuild(header: string | null, current: number): boolean {
  return header !== null && BUILD.test(header) && Number(header) > current;
}

type Listener = () => void;
let outdated = false;
const listeners = new Set<Listener>();

export const outdatedStore = {
  get: (): boolean => outdated,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  mark(): void {
    if (outdated) return;
    outdated = true;
    for (const l of listeners) l();
  },
  // Tests only.
  reset(): void {
    outdated = false;
  },
};

type FetchWindow = { fetch: typeof fetch; location: Pick<Location, 'href' | 'origin'> };

const urlOf = (input: RequestInfo | URL, base: string): URL =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, base);

const INSTALLED = Symbol.for('ezdraft.versionFetch');

// Wraps the window's fetch once. Cross-origin requests are passed on untouched.
export function installVersionFetch(win: FetchWindow, build: number = appBuild()): void {
  const holder = win as FetchWindow & { [INSTALLED]?: true };
  if (holder[INSTALLED]) return;
  holder[INSTALLED] = true;
  const original = win.fetch.bind(win);
  win.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      url = urlOf(input, win.location.href);
    } catch {
      return original(input, init);
    }
    if (url.origin !== win.location.origin) return original(input, init);
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    // A save carries its own build (outbox-sync.ts); its refusal and prompt are EZD-299's.
    if (isSaveRequest(method, url)) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined),
    );
    if (!headers.has(APP_BUILD_HEADER)) headers.set(APP_BUILD_HEADER, String(build));
    const response = await original(input, { ...init, headers });
    if (isNewerBuild(response.headers.get(APP_BUILD_HEADER), build)) {
      outdatedStore.mark();
    }
    return response;
  };
}
