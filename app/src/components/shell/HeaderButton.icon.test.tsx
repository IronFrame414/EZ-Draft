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
// EZD-108 E1 (vault/plans/EZD-108.md section 4): EZD-113's 29 names plus logout, person and settings (32),
// plus EZD-110 step 19's 12 names (44), plus EZD-117a E2 `sort` (45 in all), sorted.
// EZD-207b: fit_screen, remove.
// EZD-210a: rectangle, view_column_2.
// EZD-210b: ads_click, rotate_right (E1).
// EZD-221b E3: check, dashboard, radio_button_checked.
// EZD-217 E1: content_copy, content_paste, content_paste_go, delete, redo, undo.
// EZD-299: block, category, door_front, info, layers, my_location, refresh, report, update, window (D-Icons).
// EZD-212b: open_with.
// EZD-212c E1: keyboard_tab.
const EXPECTED_ICONS = [
  'add',
  'ads_click',
  'arrow_back',
  'arrow_forward',
  'arrow_selector_tool',
  'assignment',
  'auto_awesome',
  'autorenew',
  'badge',
  'block',
  'category',
  'chat_bubble',
  'check',
  'check_circle',
  'close',
  'cloud_off',
  'compare_arrows',
  'contact_mail',
  'content_copy',
  'content_paste',
  'content_paste_go',
  'dashboard',
  'delete',
  'description',
  'domain',
  'door_front',
  'download',
  'edit',
  'error',
  'event',
  'expand_more',
  'fit_screen',
  'gavel',
  'group',
  'help',
  'history',
  'info',
  'inventory_2',
  'key',
  'keyboard_tab',
  'kitchen',
  'layers',
  'library_add_check',
  'library_books',
  'lock',
  'logout',
  // EZD-104 (vault/plans/EZD-104.md): pending invite avatar.
  'mail',
  'monitor_heart',
  'more_horiz',
  'my_location',
  'notifications',
  'notifications_off',
  'open_with',
  'person',
  'person_book',
  'photo_camera',
  'radio_button_checked',
  'rectangle',
  'redo',
  'refresh',
  'remove',
  'report',
  'rotate_right',
  'search',
  'select_all',
  'settings',
  'share',
  'sort',
  'straighten',
  'sync_problem',
  'tune',
  'undo',
  'update',
  'upload',
  'verified_user',
  'view_column_2',
  'view_quilt',
  'visibility',
  'window',
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
    expect(html).toContain('<use href="#ez-icon-share"');
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
    expect(html).toContain('#ez-icon-download');
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
