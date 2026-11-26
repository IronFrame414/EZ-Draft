// EZD-612: the editor's calls to /api/projects/[id]/code-check (route header there). Each answers the latest run and
// what the member may do, or an error code.
import type { CodeCheckRun } from './check-status';

export type CodeCheckAnswer = {
  run: CodeCheckRun | null;
  // True when the model was saved after the run (S06 "Check not run since last change").
  changedSinceRun?: boolean;
  canRun: boolean;
  canAccept: boolean;
};
export type CodeCheckOutcome = { ok: true; answer: CodeCheckAnswer } | { ok: false; code: string };

type Fetch = typeof fetch;

async function send(fetcher: Fetch, url: string, init?: RequestInit): Promise<CodeCheckOutcome> {
  let res: Response;
  try {
    res = await fetcher(url, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, code: 'network' };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === 'string' ? code : `http_${res.status}` };
  }
  return { ok: true, answer: body as CodeCheckAnswer };
}

const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/code-check`;

export function readCodeCheck(
  projectId: string,
  fetcher: Fetch = fetch,
): Promise<CodeCheckOutcome> {
  return send(fetcher, path(projectId));
}

export function runCodeCheckNow(
  projectId: string,
  fetcher: Fetch = fetch,
): Promise<CodeCheckOutcome> {
  return send(fetcher, path(projectId), { method: 'POST' });
}

export function acceptWarning(
  projectId: string,
  input: { runId: string; ruleId: string; objectId: string; note: string },
  fetcher: Fetch = fetch,
): Promise<CodeCheckOutcome> {
  return send(fetcher, path(projectId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
