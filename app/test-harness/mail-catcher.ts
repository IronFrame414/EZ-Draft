// EZD-007d section 3 and Step 9 (vault/plans/EZD-007d.md; parent P-Step 7): reads the sign-in emails
// Supabase Auth sends on the local stack from its mail catcher (Mailpit). It never sends mail
// (CLAUDE.md rule 6). Base URL: SUPABASE_MAIL_URL if set, else MAILPIT_URL from `supabase status -o json`
// (pinned CLI 2.121.0, app/src/server/db/local-services.test.ts), read once. Mailpit HTTP API (v1.31.3 on
// the pinned stack, read 2026-10-20): GET /api/v1/search?query=, GET /api/v1/message/<id>,
// DELETE /api/v1/search?query=. A message's `Created` (milliseconds) is the time it was received.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuthEmail = { subject: string; text: string; html: string; link: string; code: string };

type Summary = { ID: string; To: { Address: string }[] | null; Created: string };
type Detail = { Subject: string; Text: string; HTML: string };

let base: string | undefined;

function mailUrl(): string {
  if (base) return base;
  const fromEnv = process.env.SUPABASE_MAIL_URL?.trim();
  if (fromEnv) {
    base = fromEnv.replace(/\/+$/, '');
    return base;
  }
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = spawnSync(
    path.join(repo, 'node_modules', '.bin', 'supabase'),
    ['status', '-o', 'json'],
    { cwd: repo, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`mail-catcher: supabase status failed: ${r.stderr ?? ''}`);
  const url = (JSON.parse(r.stdout.trim()) as Record<string, unknown>).MAILPIT_URL;
  if (typeof url !== 'string' || !url.trim()) throw new Error('mail-catcher: no MAILPIT_URL');
  base = url.trim().replace(/\/+$/, '');
  return base;
}

const query = (to: string) => encodeURIComponent(`to:"${to}"`);

async function messagesTo(to: string, after?: Date): Promise<Summary[]> {
  const res = await fetch(`${mailUrl()}/api/v1/search?query=${query(to)}&limit=200`);
  if (!res.ok) throw new Error(`mail-catcher: search answered ${res.status}`);
  const body = (await res.json()) as { messages?: Summary[] };
  const wanted = to.toLowerCase();
  return (body.messages ?? [])
    .filter((m) => (m.To ?? []).some((a) => a.Address.toLowerCase() === wanted))
    .filter((m) => !after || new Date(m.Created).getTime() >= after.getTime())
    .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const CONFIRM_URL = /https?:\/\/[^\s"'<>()]*\/auth\/confirm\?[^\s"'<>()]*/g;
const ANY_URL = /https?:\/\/[^\s"'<>()]+/g;

function parse(detail: Detail): AuthEmail {
  const text = detail.Text ?? '';
  const html = detail.HTML ?? '';
  const urls = new Set([
    ...(text.match(CONFIRM_URL) ?? []),
    ...(decodeEntities(html).match(CONFIRM_URL) ?? []),
  ]);
  if (urls.size !== 1) {
    throw new Error(`mail-catcher: expected one distinct /auth/confirm URL, found ${urls.size}`);
  }
  const [link] = [...urls];
  const strip = (s: string) =>
    s
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(ANY_URL, ' ');
  const codes = new Set([
    ...(strip(text).match(/(?<!\d)\d{6}(?!\d)/g) ?? []),
    ...(strip(decodeEntities(html)).match(/(?<!\d)\d{6}(?!\d)/g) ?? []),
  ]);
  if (codes.size !== 1) {
    throw new Error(`mail-catcher: expected one distinct 6-digit code, found ${codes.size}`);
  }
  const [code] = [...codes];
  return { subject: detail.Subject ?? '', text, html, link, code };
}

export async function waitForAuthEmail(
  to: string,
  opts: { after?: Date; timeoutMs?: number } = {},
): Promise<AuthEmail> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [newest] = await messagesTo(to, opts.after);
    if (newest) {
      const res = await fetch(`${mailUrl()}/api/v1/message/${newest.ID}`);
      if (!res.ok) throw new Error(`mail-catcher: message answered ${res.status}`);
      return parse((await res.json()) as Detail);
    }
    if (Date.now() >= deadline) {
      throw new Error(`mail-catcher: no email within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function countAuthEmails(to: string, opts: { after?: Date } = {}): Promise<number> {
  return (await messagesTo(to, opts.after)).length;
}

export async function clearAuthEmails(to: string): Promise<void> {
  const res = await fetch(`${mailUrl()}/api/v1/search?query=${query(to)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`mail-catcher: delete answered ${res.status}`);
}
