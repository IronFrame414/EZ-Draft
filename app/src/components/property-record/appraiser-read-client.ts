// EZD-711 (S01 Property appraiser link; S13 Controls "Property appraiser import"; 11 rule 11 "Push, not poll"): the
// browser side of one appraiser read. POST /api/property-records/read starts an ai_read job (or answers a link the
// server may not fetch as unreadable at once); the job's progress arrives on the member's user channel
// (appraiser_read_broadcast), and the job is fetched once when it finishes, once when the channel is ready (a read
// that finished before the subscription) and after each resync. No timers.
// The answer is checked with the zod schema, which is loaded when the first answer arrives, so the Projects page
// does not download zod before anyone reads an appraiser page (11 Performance rule 7).
import type { AppraiserReadOutput } from '../../lib/property-record/property-record';
import type { UserHandle } from '../../lib/realtime/hub';

export type ReadInput =
  | { kind: 'link'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'screenshot'; file: File };

// `failed`: the job failed or the read could not start (the screen shows the S01 failure text either way).
export type ReadAnswer = AppraiserReadOutput | { status: 'failed'; denied?: boolean };

// A read's output as the job stored it; anything else is a failed read. Rejects when the schema cannot be loaded.
async function checkedOutput(output: unknown): Promise<ReadAnswer> {
  const { appraiserReadOutputSchema } = await import('../../lib/property-record/property-record');
  const parsed = appraiserReadOutputSchema.safeParse(output);
  return parsed.success ? parsed.data : { status: 'failed' };
}

export async function startRead(
  projectId: string | null,
  input: ReadInput,
  fetchFn: typeof fetch = fetch,
): Promise<{ jobId: string } | ReadAnswer> {
  let init: RequestInit;
  if (input.kind === 'screenshot') {
    const form = new FormData();
    form.set('projectId', projectId ?? '');
    form.set('screenshot', input.file);
    init = { method: 'POST', body: form };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        input.kind === 'link' ? { projectId, url: input.url } : { projectId, text: input.text },
      ),
    };
  }
  let res: Response;
  try {
    res = await fetchFn('/api/property-records/read', { ...init, credentials: 'same-origin' });
  } catch {
    return { status: 'failed' };
  }
  if (res.status === 202) {
    const body = (await res.json().catch(() => null)) as { jobId?: unknown } | null;
    return typeof body?.jobId === 'string' ? { jobId: body.jobId } : { status: 'failed' };
  }
  if (res.status === 200) {
    const body = (await res.json().catch(() => null)) as { output?: unknown } | null;
    // The schema file failing to load is a read that could not start, like the request failing above.
    return checkedOutput(body?.output).catch(() => ({ status: 'failed' }) as const);
  }
  return { status: 'failed', denied: res.status === 403 };
}

export async function fetchReadJob(jobId: string, fetchFn: typeof fetch = fetch): Promise<ReadAnswer | null> {
  const res = await fetchFn(`/api/jobs/${jobId}`, { credentials: 'same-origin' });
  if (!res.ok) return { status: 'failed' };
  const body = (await res.json().catch(() => null)) as {
    job?: { status?: unknown; result?: { output?: unknown } | null };
  } | null;
  const status = body?.job?.status;
  if (status === 'failed') return { status: 'failed' };
  if (status !== 'done') return null;
  // A rejection here (the schema file did not load) is handled like a failed fetch: watchRead tries again.
  return checkedOutput(body?.job?.result?.output);
}

/** Calls `onAnswer` once with the finished job's answer; returns the unsubscribe. */
export function watchRead(
  channel: Pick<UserHandle, 'on' | 'onResync' | 'ready'>,
  jobId: string,
  onAnswer: (answer: ReadAnswer) => void,
  fetchFn: typeof fetch = fetch,
): () => void {
  let settled = false;
  const check = () => {
    if (settled) return;
    fetchReadJob(jobId, fetchFn).then(
      (answer) => {
        if (answer === null || settled) return;
        settled = true;
        onAnswer(answer);
      },
      () => {
        // A failed fetch is ignored: the next event or resync fetches again.
      },
    );
  };
  const off = channel.on('job.progress', (payload) => {
    if (payload.jobId === jobId && (payload.status === 'done' || payload.status === 'failed')) check();
  });
  const offResync = channel.onResync(() => check());
  void channel.ready.then(() => check());
  return () => {
    settled = true;
    off();
    offResync();
  };
}
