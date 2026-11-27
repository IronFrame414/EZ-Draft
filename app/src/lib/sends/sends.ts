// EZD-111 (vault/plans/EZD-111.md P111 L1-L4): the browser side of a send to the client. The recipient read
// (GET send-recipient) and the send (POST sends). A thrown fetch or an unreadable body is status 0 `network`.
export type SendRecipient = { name: string; email: string };
// savedAt: ISO time of the newest saved object, or null when the project has none.
export type SendHolder = { name: string; savedAt: string | null };
export type ClientSend = {
  id: string;
  modelVersionId: string;
  // EZD-121 (R24 #26): the sent version's number, Version N.
  versionNo: number;
  // EZD-719 (S13 Controls "Version N before Rev 0, Rev N after"): the Rev this send was numbered (the next after
  // the newest issued revision), or null before Rev 0.
  revNo: number | null;
  link: string;
  emailSent: boolean;
  recipient: SendRecipient;
  holder: SendHolder | null;
  expiresAt: string;
};

export const SEND_NOTE_MAX = 1000;

// EZD-719 (S13 Controls, rule 12; R24 #26; 09h Revision rules; AC-EZD-719-1): the label a client send goes out
// under. Before Rev 0 it is "Version N" (N its sent number); after Rev 0 it is "Rev N", the next Rev it took.
export type SendLabel = { kind: 'version' | 'rev'; no: number };

export function sendLabel(send: Pick<ClientSend, 'versionNo' | 'revNo'>): SendLabel {
  return typeof send.revNo === 'number' ? { kind: 'rev', no: send.revNo } : { kind: 'version', no: send.versionNo };
}

// EZD-719 (assumptions EZD-719 "What sends the set sends"): the set the Sheets screen's Share sends; id null while
// the set is the unchanged default.
export type SendSet = { kind: 'permit' | 'client'; id: string | null };

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
  opts?: { fetchImpl?: typeof fetch; set?: SendSet | null },
): Promise<SendResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(`${base(projectId)}/sends`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(opts?.set ? { note, set: opts.set } : { note }),
    });
    body = await res.json();
  } catch {
    return { ok: false, status: 0, code: 'network' };
  }
  if (res.status === 201) return { ok: true, send: (body as { send: ClientSend }).send };
  return { ok: false, status: res.status, code: codeOf(body) };
}
