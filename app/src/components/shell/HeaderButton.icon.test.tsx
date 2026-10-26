// EZD-014b · T3 (U12): HeaderButton icon form (vault/plans/EZD-014b.md Sections 3, 4).
// Sources: Q-0055 (a); 11 Accessibility; Q-0098; EZD-011a H8 (unchanged without icon).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import styles from './HeaderButton.module.css';
import { HeaderButton } from './HeaderButton';
import { ICON_NAMES } from '../icon/icon-names.generated';

const here = path.dirname(fileURLToPath(import.meta.url));
const classTokens = (html: string) =>
  (/class="([^"]*)"/.exec(html)?.[1] ?? '').split(' ').filter((c) => c.length > 0);
const count = (html: string, needle: string) => html.split(needle).length - 1;
// EZD-113 E1 (vault/plans/EZD-113.md Decided "Icons"): the 29 names, EZD-112's 24 plus add,
// more_horiz, person_book, search and verified_user.
const EXPECTED_ICONS = [
  'add',
  'arrow_back',
  'arrow_selector_tool',
  'auto_awesome',
  'badge',
  'close',
  'cloud_off',
  'contact_mail',
  'description',
  'domain',
  'download',
  'error',
  'expand_more',
  'gavel',
  'group',
  'help',
  'history',
  'inventory_2',
  'kitchen',
  'library_books',
  'monitor_heart',
  'more_horiz',
  'person_book',
  'search',
  'share',
  'tune',
  'upload',
  'verified_user',
  'view_quilt',
];

describe('EZD-014b HeaderButton icon form', () => {
  it('T3 (1): without icon the markup is unchanged', () => {
    expect(renderToStaticMarkup(<HeaderButton>Share</HeaderButton>)).toBe(
      `<button type="button" class="${styles.button}">Share</button>`,
    );
  });

  it('T3 (2): icon form has icon span, svg and label span in order', () => {
    const html = renderToStaticMarkup(<HeaderButton icon="share">Share</HeaderButton>);
    expect(count(html, '<button')).toBe(1);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Share"');
    expect(html).toContain('title="Share"');
    expect(classTokens(html)).toEqual([styles.button]);
    const iconSpan = `<span class="${styles.icon}" data-header-button-icon="">`;
    const labelSpan = `<span class="${styles.label}" data-header-button-label="">Share</span>`;
    expect(html).toContain(iconSpan);
    expect(count(html, '<svg')).toBe(1);
    expect(html).toContain('width="18"');
    expect(html).toContain('<use href="/icons/sprite.svg#share"');
    expect(html).toContain(labelSpan);
    expect(html.indexOf(iconSpan)).toBeLessThan(html.indexOf(labelSpan));
  });

  it('T3 (3): primary icon form', () => {
    const html = renderToStaticMarkup(
      <HeaderButton variant="primary" icon="download">
        Export
      </HeaderButton>,
    );
    expect(classTokens(html)).toEqual([styles.button, styles.primary]);
    expect(html).toContain('aria-label="Export"');
    expect(html).toContain('title="Export"');
    expect(html).toContain('#download');
  });

  it('T3 (4): explicit aria-label and title win, each once', () => {
    const html = renderToStaticMarkup(
      <HeaderButton icon="share" aria-label="Share project" title="Share project">
        Share
      </HeaderButton>,
    );
    expect(count(html, 'aria-label="Share project"')).toBe(1);
    expect(count(html, 'title="Share project"')).toBe(1);
    expect(count(html, 'aria-label=')).toBe(1);
    expect(count(html, 'title=')).toBe(1);
  });

  it('T3 (5): ICON_NAMES and icons.json', () => {
    expect([...ICON_NAMES]).toEqual(EXPECTED_ICONS);
    const json = JSON.parse(readFileSync(path.join(here, '../icon/icons.json'), 'utf8'));
    expect(json).toEqual(EXPECTED_ICONS);
  });
});
