// EZD-008a Step 3 · readers for the stub email outbox folder (used by browser tests and later tickets).
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { StubMessage } from '../src/server/email/test-harness/stub-transport';

export function readStubOutboxDir(dir: string): StubMessage[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as StubMessage);
}

export function clearStubOutboxDir(dir: string): void {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f));
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function linksIn(m: Pick<StubMessage, 'text' | 'html'>): { text: string[]; html: string[] } {
  const text = m.text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const html = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => unescapeHtml(x[1]));
  return { text, html };
}
