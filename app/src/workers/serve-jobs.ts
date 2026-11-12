// EZD-235b Build step 1 (vault/plans/EZD-235b.md): serveJobs, the message loop each pooled worker runs.
export type JobRequest = { id: number; kind: string; input: unknown };

export type JobErrorCode = 'worker.unknown_job' | 'worker.job_failed';

export type JobReply =
  { id: number; ok: true; output: unknown } | { id: number; ok: false; error: JobErrorCode };

export type JobHandler = (input: unknown) => unknown;

export type JobScope = {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: JobReply): void;
};

function postFailure(scope: JobScope, id: number): void {
  try {
    scope.postMessage({ id, ok: false, error: 'worker.job_failed' });
  } catch {
    // The failure reply itself cannot be posted; nothing else can carry it.
  }
}

async function answer(
  scope: JobScope,
  handler: JobHandler,
  id: number,
  input: unknown,
): Promise<void> {
  let output: unknown;
  try {
    output = await handler(input);
  } catch {
    postFailure(scope, id);
    return;
  }
  try {
    scope.postMessage({ id, ok: true, output });
  } catch {
    postFailure(scope, id);
  }
}

export function serveJobs(scope: JobScope, handlers: Readonly<Record<string, JobHandler>>): void {
  scope.onmessage = (event) => {
    const data = event.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
    const { id, kind, input } = data as { id?: unknown; kind?: unknown; input?: unknown };
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) return;
    if (typeof kind !== 'string' || !Object.hasOwn(handlers, kind)) {
      scope.postMessage({ id, ok: false, error: 'worker.unknown_job' });
      return;
    }
    void answer(scope, handlers[kind]!, id, input);
  };
}
