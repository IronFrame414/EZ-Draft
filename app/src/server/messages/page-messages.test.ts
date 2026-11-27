// EZD-1995 (AC-EZD-1995-1; audit 2026-11-26 F1: every office and editor page sent the whole English office catalog).
import { describe, expect, it } from 'vitest';
import { catalogFor } from './catalog';
import { PAGE_MESSAGES, SHARED_PREFIXES, pageMessages } from './page-messages';
import type { MessagePage } from './page-messages';

const OFFICE = catalogFor('office', 'en');
const PAGES = Object.keys(PAGE_MESSAGES) as MessagePage[];

describe('EZD-1995 AC-1: each page gets only its own messages', () => {
  it('no page gets the whole office catalog', () => {
    const whole = Object.keys(OFFICE).length;
    for (const page of PAGES) {
      expect(Object.keys(pageMessages(page)).length, page).toBeLessThan(whole);
    }
  });

  it("a page's messages are the office catalog's messages under its prefixes, unchanged", () => {
    for (const page of PAGES) {
      const prefixes: readonly string[] = [...SHARED_PREFIXES, ...PAGE_MESSAGES[page]];
      const slice = pageMessages(page);
      for (const [key, value] of Object.entries(OFFICE)) {
        const wanted = prefixes.some((p) => key.startsWith(p));
        expect(Object.hasOwn(slice, key), `${page} ${key}`).toBe(wanted);
        if (wanted) expect(slice[key as keyof typeof slice]).toEqual(value);
      }
    }
  });

  it('every page has the shared common and error messages', () => {
    for (const page of PAGES) {
      const slice = pageMessages(page);
      expect(slice['error.db_unavailable'], page).toBe("Can't reach the database. Try again in a minute.");
      expect(slice['common.sign_in.title'], page).toBe('Sign in to EZ Draft');
    }
  });

  it('Projects leaves out the editor screens and Settings leaves out the editor', () => {
    expect(pageMessages('projects')['office.projects.title']).toBe('Projects');
    expect(Object.keys(pageMessages('projects')).some((k) => k.startsWith('office.countertops.'))).toBe(false);
    expect(Object.keys(pageMessages('projects')).some((k) => k.startsWith('office.electrical.'))).toBe(false);
    expect(Object.keys(pageMessages('settings')).some((k) => k.startsWith('office.electrical.'))).toBe(false);
  });

  it('the lazy editor screens are not sent with the editor page', () => {
    const editor = Object.keys(pageMessages('editor'));
    for (const lazy of ['office.countertops.', 'office.switcher.', 'office.sheets.', 'office.help.']) {
      expect(editor.some((k) => k.startsWith(lazy)), lazy).toBe(false);
    }
  });

  it('never sends a dev message, and gives the same frozen object each time', () => {
    for (const page of PAGES) {
      const slice = pageMessages(page);
      expect(Object.keys(slice).some((k) => k.startsWith('dev.')), page).toBe(false);
      expect(Object.isFrozen(slice)).toBe(true);
      expect(pageMessages(page)).toBe(slice);
    }
  });
});
