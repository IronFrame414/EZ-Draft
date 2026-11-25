// EZD-1987 (AC-EZD-1987-1; audit F10; S12 board: Plan underlined in the header): with `activeHref`, the active tab is a
// link back to the project's editor that keeps the active look; without it, every tab stays a button (EZD-011b).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { EditorHeader } from './EditorHeader';
import styles from './EditorHeader.module.css';

const fn = () => {};
const BASE = {
  projectsHref: '/',
  projectName: 'bravo',
  activeView: 'plan' as const,
  views: ['plan', 'sheets'] as const,
  onViewChange: fn,
};

function render(props: Partial<{ activeHref: string }>): string {
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <EditorHeader {...BASE} {...props} />
    </MessagesProvider>,
  );
}

const nav = (html: string) => /<nav[\s\S]*?<\/nav>/.exec(html)![0];

describe('EZD-1987 EditorHeader activeHref', () => {
  it('renders the active tab as a link to the href with aria-current and the active class', () => {
    const html = nav(render({ activeHref: '/projects/abc' }));
    const link = /<a([^>]*)>([^<]*)<\/a>/.exec(html);
    expect(link).not.toBeNull();
    expect(link![2]).toBe('Plan');
    expect(link![1]).toContain('href="/projects/abc"');
    expect(link![1]).toContain('aria-current="page"');
    expect(link![1]).toContain(styles.tab);
    expect(link![1]).toContain(styles.active);
    // The other tab stays a button.
    expect([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual(['Sheets']);
  });

  it('without activeHref, no tab is a link', () => {
    const html = nav(render({}));
    expect(html).not.toContain('<a');
    expect([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual([
      'Plan',
      'Sheets',
    ]);
  });
});
