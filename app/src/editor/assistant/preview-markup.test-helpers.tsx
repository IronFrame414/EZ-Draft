// EZD-5604b test helpers: static markup in the office MessagesProvider and element lookup by data-testid, as the
// EZD-5603a panel tests do (no DOM environment in the app's unit tests; vault/build/assumptions.md EZD-105b).
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';

export const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      {ui}
    </MessagesProvider>,
  );

export type El = { open: string; inner: string; outer: string };

// Every element carrying data-testid="id", with its balanced inner markup.
export function els(html: string, id: string): El[] {
  const out: El[] = [];
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*data-testid="${id}"[^>]*>`, 'g');
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = m[1]!;
    const from = re.lastIndex;
    if (m[0].endsWith('/>')) {
      out.push({ open: m[0], inner: '', outer: m[0] });
      continue;
    }
    let depth = 1;
    const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
    tags.lastIndex = from;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      if (t[1] === '/') depth -= 1;
      else if (!t[0].endsWith('/>')) depth += 1;
      if (depth === 0) {
        out.push({
          open: m[0],
          inner: html.slice(from, t.index),
          outer: html.slice(m.index, tags.lastIndex),
        });
        break;
      }
    }
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
export const text = (s: string) =>
  decode(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
export const classes = (open: string) =>
  (/class="([^"]*)"/.exec(open)?.[1] ?? '').split(' ').filter((c) => c.length > 0);
export const disabled = (open: string) => /\sdisabled=""/.test(open);
