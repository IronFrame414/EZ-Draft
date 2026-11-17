// EZD-111 (vault/plans/EZD-111.md P111 L1-L4): the browser side of a send to the client. The recipient read
// (GET send-recipient) and the send (POST sends). A thrown fetch or an unreadable body is status 0 `network`.
export type SendRecipient = { name: string; email: string };
// savedAt: ISO time of the newest saved object, or null when the project has none.
export type SendHolder = { name: string; savedAt: string | null };
export type ClientSend = {
  id: string;
  modelVersionId: string;
  link: string;
  emailSent: boolean;
  recipient: SendRecipient;
  holder: SendHolder | null;
  expiresAt: string;
};

export const SEND_NOTE_MAX = 1000;

export type RecipientResult =
  | { ok: true; recipient: SendRecipient | null }
  | { ok: false; status: number; code: string };
export type SendResult = { ok: true; send: ClientSend } | { ok: false; status: number; code: string };

const codeOf = (body: unknown): string => {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : 'network';
};

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

export async function fetchSendRecipient(
  projectId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<RecipientResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(`${base(projectId)}/send-recipient`, { credentials: 'same-origin' });
    body = await res.json();
  } catch {
    return { ok: false, status: 0, code: 'network' };
  }
  if (res.status === 200) {
    const r = (body as { recipient?: SendRecipient | null } | null)?.recipient ?? null;
    return { ok: true, recipient: r };
  }
  return { ok: false, status: res.status, code: codeOf(body) };
}

export async function postClientSend(
  projectId: string,
  note: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<SendResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(`${base(projectId)}/sends`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ note }),
    });
    body = await res.json();
  } catch {
    return { ok: false, status: 0, code: 'network' };
  }
  if (res.status === 201) return { ok: true, send: (body as { send: ClientSend }).send };
  return { ok: false, status: res.status, code: codeOf(body) };
}
