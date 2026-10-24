// EZD-011b · H1-H6, H17: EditorHeader markup, labels through t(), exports and memo (vault/plans/EZD-011b.md Sections 3, 4).
// Sources: Section 3 contract; 04 Header card (order, tab names, " · "); S03 nav aria-label="Views", chevron 18 px;
// Section 6 wording; EZD-026d (useT outside a provider throws naming MessagesProvider).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { EditorHeader } from './EditorHeader';
import { Wordmark } from './Wordmark';
import { EDITOR_VIEWS, VIEW_LABEL_KEYS } from './editor-views';
import styles from './EditorHeader.module.css';
import wordmarkStyles from './Wordmark.module.css';
import * as shell from './index';
import { HeaderCard } from './HeaderCard';
import { HeaderButton } from './HeaderButton';

const here = path.dirname(fileURLToPath(import.meta.url));
const fn = () => {};

function withProvider(ui: ReactElement, messages: object = catalogFor('office', 'en')): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={messages as never}>
      {ui}
    </MessagesProvider>,
  );
}

const HP = {
  projectsHref: '/',
  projectName: 'P1',
  onProjectMenu: fn,
  subtitle: ['A', 'B', 'C'],
  activeView: 'plan' as const,
  onViewChange: fn,
  reviewPill: <i data-slot="pill" />,
  share: <i data-slot="share" />,
  export: <i data-slot="export" />,
  issueSet: <i data-slot="issue" />,
};

const MIN = { projectsHref: '/', projectName: 'P1', activeView: 'plan' as const, onViewChange: fn };

const text = (html: string) => html.replace(/<[^>]*>/g, '');
const classTokens = (openTag: string): string[] => {
  const m = /class="([^"]*)"/.exec(openTag);
  return m ? m[1].split(' ').filter((c) => c.length > 0) : [];
};

// The full outer markup of the element whose opening tag starts at `start`.
function outerAt(html: string, start: number): string {
  const name = /^<(\w+)/.exec(html.slice(start))![1];
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error('unbalanced markup');
}

// Start index and opening tag of the first element having `token` among its class tokens, or null.
function findByClass(html: string, token: string): { index: number; open: string } | null {
  for (const m of html.matchAll(/<\w+[^>]*>/g)) {
    if (classTokens(m[0]).includes(token)) return { index: m.index!, open: m[0] };
  }
  return null;
}

function tabs(html: string): { open: string; text: string }[] {
  const nav = /<nav[\s\S]*?<\/nav>/.exec(html)![0];
  return [...nav.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    open: `<button${m[1]}>`,
    text: text(m[2]),
  }));
}

describe('EZD-011b EditorHeader', () => {
  it('H1 (a)(b)(c): one header; wordmark, divider, name button with chevron, subtitle, nav with 4 tabs, slots in order', () => {
    const html = withProvider(<EditorHeader {...HP} />);
    expect(html.split('<header').length - 1).toBe(1);

    const a = /<a [^>]*>/.exec(html)!;
    expect(a[0]).toContain('href="/"');
    expect(classTokens(a[0])).toEqual([wordmarkStyles.wordmark]);
    expect(text(outerAt(html, a.index))).toBe('ezdraft');

    const dividerHit = findByClass(html, styles.divider)!;
    expect(dividerHit).not.toBeNull();
    expect(dividerHit.open.startsWith('<span')).toBe(true);
    expect(dividerHit.open).toContain('aria-hidden="true"');
    const divider = dividerHit.index;
    expect(divider).toBeGreaterThan(html.indexOf('</a>'));

    const nameHit = findByClass(html, styles.name)!;
    expect(nameHit.index).toBeGreaterThan(divider);
    expect(nameHit.open.startsWith('<button')).toBe(true);
    expect(nameHit.open).toContain('type="button"');
    expect(nameHit.open).toContain('title="P1"');
    expect(classTokens(nameHit.open)).toEqual([styles.name]);
    const nameEl = outerAt(html, nameHit.index);
    expect(text(nameEl)).toBe('P1');
    expect(nameEl).toContain('<use href="/icons/sprite.svg#expand_more"');
    expect(nameEl).toContain('width="18"');

    const subHit = findByClass(html, styles.subtitle)!;
    expect(subHit.index).toBeGreaterThan(nameHit.index);
    const subEl = outerAt(html, subHit.index);
    expect(text(subEl)).toBe('A · B · C');
    expect(subEl.split('<span aria-hidden="true"> · </span>').length - 1).toBe(2);

    const navStart = html.indexOf('<nav');
    expect(navStart).toBeGreaterThan(subHit.index);
    expect(html.slice(navStart, html.indexOf('>', navStart))).toContain('aria-label="Views"');
    const t = tabs(html);
    expect(t.length).toBe(4);
    for (const tab of t) expect(tab.open).toContain('type="button"');
    expect(t.map((x) => x.text)).toEqual(['Plan', '3D', 'Sheets', 'Render']);

    const afterNav = html.slice(html.indexOf('</nav>'));
    const slots = [...afterNav.matchAll(/data-slot="(\w+)"/g)].map((m) => m[1]);
    expect(slots).toEqual(['pill', 'share', 'export', 'issue']);
    expect(afterNav.indexOf('</header>')).toBeGreaterThan(afterNav.lastIndexOf('data-slot'));

    expect(html.split('aria-current="page"').length - 1).toBe(1);
    const planTab = t.find((x) => x.text === 'Plan')!;
    expect(planTab.open).toContain('aria-current="page"');
  });

  it('H2: the active tab follows activeView (aria-current and styles.active on that tab only)', () => {
    const cases = [
      ['3d', '3D'],
      ['sheets', 'Sheets'],
      ['render', 'Render'],
    ] as const;
    for (const [view, label] of cases) {
      const html = withProvider(<EditorHeader {...HP} activeView={view} />);
      const t = tabs(html);
      expect(t.filter((x) => x.open.includes('aria-current="page"')).map((x) => x.text)).toEqual([
        label,
      ]);
      expect(
        t.filter((x) => classTokens(x.open).includes(styles.active)).map((x) => x.text),
      ).toEqual([label]);
      for (const tab of t.filter((x) => x.text !== label)) {
        expect(classTokens(tab.open)).toEqual([styles.tab]);
      }
      expect(classTokens(t.find((x) => x.text === label)!.open)).toEqual([
        styles.tab,
        styles.active,
      ]);
    }
  });

  it('H3: empty slots and optional parts render nothing', () => {
    const one = withProvider(<EditorHeader {...MIN} />);
    expect(one.slice(one.indexOf('</nav>') + '</nav>'.length, one.indexOf('</header>'))).toBe('');
    expect(one).not.toContain('expand_more');
    expect(one.split('<button').length - 1).toBe(4);
    const nameHit = findByClass(one, styles.name)!;
    expect(nameHit.open.startsWith('<span')).toBe(true);
    expect(nameHit.open).toContain('title="P1"');
    expect(text(outerAt(one, nameHit.index))).toBe('P1');
    expect(findByClass(one, styles.subtitle)).toBeNull();

    const two = withProvider(
      <EditorHeader {...MIN} subtitle={['A', null, '', false, 'B'] as unknown as string[]} />,
    );
    const subHit = findByClass(two, styles.subtitle)!;
    expect(text(outerAt(two, subHit.index))).toBe('A · B');
    expect(two.split('<span aria-hidden="true"> · </span>').length - 1).toBe(1);

    const three = withProvider(
      <EditorHeader {...MIN} subtitle={[null, ''] as unknown as string[]} />,
    );
    expect(findByClass(three, styles.subtitle)).toBeNull();
  });

  it('H4: a views subset keeps the 04 order and never throws', () => {
    const one = withProvider(<EditorHeader {...HP} views={['render', 'plan']} />);
    const t = tabs(one);
    expect(t.map((x) => x.text)).toEqual(['Plan', 'Render']);
    expect(t[0].open).toContain('aria-current="page"');

    const two = withProvider(<EditorHeader {...HP} views={['render']} />);
    expect(tabs(two).map((x) => x.text)).toEqual(['Render']);
    expect(two).not.toContain('aria-current');
  });

  it('H5: every label goes through t() with its office.header key', () => {
    const keys = [
      'office.header.wordmark_ez',
      'office.header.wordmark_draft',
      'office.header.views',
      'office.header.view.plan',
      'office.header.view.3d',
      'office.header.view.sheets',
      'office.header.view.render',
    ];
    const messages: Record<string, unknown> = { ...catalogFor('office', 'en') };
    for (const k of keys) messages[k] = `X:${k}`;
    const html = withProvider(<EditorHeader {...HP} />, messages);

    const a = /<a [^>]*>/.exec(html)!;
    expect(text(outerAt(html, a.index))).toBe(
      'X:office.header.wordmark_ezX:office.header.wordmark_draft',
    );
    expect(html).toContain('aria-label="X:office.header.views"');
    expect(tabs(html).map((x) => x.text)).toEqual([
      'X:office.header.view.plan',
      'X:office.header.view.3d',
      'X:office.header.view.sheets',
      'X:office.header.view.render',
    ]);
    for (const word of ['Plan', '3D', 'Sheets', 'Render', 'Views', 'ezdraft']) {
      expect(html, word).not.toContain(word);
    }
  });

  it('H6: without a MessagesProvider it throws an Error naming MessagesProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderToStaticMarkup(<EditorHeader {...HP} />)).toThrow(Error);
      expect(() => renderToStaticMarkup(<EditorHeader {...HP} />)).toThrow(/MessagesProvider/);
    } finally {
      spy.mockRestore();
    }
  });
});

const squash = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function block(css: string, selector: string): string[] {
  const rules = [...squash(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)];
  const hit = rules.find((r) => squash(r[1]) === selector);
  if (!hit) return [];
  return hit[2]
    .split(';')
    .map((d) => squash(d))
    .filter((d) => d.length > 0);
}
const firstStatement = (src: string) =>
  src.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '').slice(0, 14);

describe('EZD-011b exports, memo and view constants', () => {
  it('H17 (a): the shell barrel re-exports the new parts and keeps 11A parts', () => {
    expect(shell.EditorHeader).toBe(EditorHeader);
    expect(shell.Wordmark).toBe(Wordmark);
    expect(shell.EDITOR_VIEWS).toBe(EDITOR_VIEWS);
    expect(shell.VIEW_LABEL_KEYS).toBe(VIEW_LABEL_KEYS);
    expect(shell.HeaderCard).toBe(HeaderCard);
    expect(shell.HeaderButton).toBe(HeaderButton);
  });

  it('H17 (b): EDITOR_VIEWS and VIEW_LABEL_KEYS hold the contract values', () => {
    expect([...EDITOR_VIEWS]).toEqual(['plan', '3d', 'sheets', 'render']);
    expect(VIEW_LABEL_KEYS).toEqual({
      plan: 'office.header.view.plan',
      '3d': 'office.header.view.3d',
      sheets: 'office.header.view.sheets',
      render: 'office.header.view.render',
    });
  });

  it('H17 (c): EditorHeader is a React.memo component', () => {
    expect((EditorHeader as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    );
  });

  it('H17 (d): EditorHeader.tsx and Wordmark.tsx start with the use client directive', () => {
    for (const f of ['EditorHeader.tsx', 'Wordmark.tsx']) {
      const src = readFileSync(path.join(here, f), 'utf8');
      expect(firstStatement(src), f).toMatch(/^['"]use client['"]/);
    }
  });

  it('H17 (e): Wordmark.module.css sets the wordmark and accent declarations', () => {
    const css = readFileSync(path.join(here, 'Wordmark.module.css'), 'utf8');
    const w = block(css, '.wordmark');
    expect(w).toContain('color: var(--ez-ink)');
    expect(w).toContain('font-size: 18px');
    expect(w).toContain('font-weight: 600');
    expect(block(css, '.accent')).toContain('color: var(--ez-cobalt)');
  });
});
