// EZD-1995 (AC-EZD-1995-2; Q-0814): a missing message can never crash a screen. For every page list in
// page-messages.ts this reads the page's source (message-usage.test-helpers.ts) and fails, naming the key or prefix,
// when the page or anything it imports can use a message its list leaves out. It also checks the /api/ answers the
// page reads, which can carry message keys. A lazy screen that loads its own messages (screen-prefixes.ts) is
// checked the same way against its own list plus the list of each page that can open it.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import {
  SRC,
  apiRoutesFor,
  pageGraph,
  rel,
  resolveImport,
  routeFilesUnder,
  scanFile,
  sourceFiles,
  usesOf,
} from './message-usage.test-helpers';
import { PAGE_MESSAGES, SHARED_PREFIXES } from './page-messages';
import type { MessagePage } from './page-messages';
import { SCREEN_MESSAGES } from './screen-prefixes';
import type { MessageScreen } from './screen-prefixes';

const KEYS = Object.keys(en);
const OFFICE_KEYS = KEYS.filter((k) => !k.startsWith('dev.'));

/**
 * Key templates whose start the reader cannot see, with the prefixes the start can take. A new one fails the test
 * until it is listed here.
 */
const UNRESOLVED_PREFIXES: Record<string, readonly string[]> = {
  // `labels` is 'office' or 'field' (EZD-1404).
  'components/phone/OfflineStatusIcon.tsx': ['field.offline_icon.', 'office.offline_icon.'],
};

const ALL_SOURCES = sourceFiles();
const APP_DIR = join(SRC, 'app');
const isLayout = (f: string): boolean => /^layout\.tsx?$/.test(basename(f));

/** The files that render inside the page's MessagesProvider: those that call pageMessages('<page>'), plus the
 * app route files that import one of them, plus every route file under such a layout. */
function entriesOf(page: MessagePage): string[] {
  const callers = ALL_SOURCES.filter((f) =>
    new RegExp(`pageMessages\\(\\s*'${page}'\\s*\\)`).test(readFileSync(f, 'utf8')),
  );
  const out = new Set<string>();
  const add = (f: string): void => {
    out.add(f);
    if (isLayout(f)) for (const r of routeFilesUnder(f)) out.add(r);
  };
  for (const caller of callers) {
    add(caller);
    for (const f of ALL_SOURCES) {
      if (!f.startsWith(APP_DIR)) continue;
      if (scanFile(f).imports.some((s) => resolveImport(f, s) === caller)) add(f);
    }
  }
  return [...out];
}

function covered(prefixes: readonly string[], key: string): boolean {
  return prefixes.some((p) => key.startsWith(p));
}

/** Keys and prefixes the files (and what they import) can use that the prefixes leave out, each with its file. */
function missingIn(entries: readonly string[], prefixes: readonly string[]): string[] {
  const graph = pageGraph(entries);
  const uses = usesOf(graph.files, KEYS);
  const api = usesOf(pageGraph(apiRoutesFor(uses.apiUrls)).files, KEYS);
  const missing: string[] = [];
  for (const u of [uses, api]) {
    for (const [key, file] of u.keys) if (!covered(prefixes, key)) missing.push(`${key} (${file})`);
    for (const [prefix, file] of u.prefixes) {
      const out = KEYS.filter((k) => k.startsWith(prefix) && !covered(prefixes, k));
      if (out.length > 0) missing.push(`${prefix}* (${file}; ${out.length} keys)`);
    }
    for (const text of u.unresolved) {
      const file = text.slice(0, text.indexOf(':'));
      const known = UNRESOLVED_PREFIXES[file];
      if (!known) {
        missing.push(`unreadable key template ${text}: list its prefixes in UNRESOLVED_PREFIXES`);
        continue;
      }
      for (const p of known) {
        if (KEYS.some((k) => k.startsWith(p) && !covered(prefixes, k))) missing.push(`${p}* (${file})`);
      }
    }
  }
  return [...new Set(missing)].sort();
}

function missingFor(page: MessagePage, list: readonly string[] = PAGE_MESSAGES[page]): string[] {
  return missingIn(entriesOf(page), [...SHARED_PREFIXES, ...list]);
}

/** Every lazy screen (file -> name) the page can open, also from inside another lazy screen. */
function screensOf(page: MessagePage): Map<string, string> {
  const out = new Map<string, string>();
  const stack = [...pageGraph(entriesOf(page)).deferredScreens];
  while (stack.length > 0) {
    const [file, name] = stack.pop() as [string, string];
    if (out.has(file)) continue;
    out.set(file, name);
    stack.push(...pageGraph([file]).deferredScreens);
  }
  return out;
}

function missingForScreen(
  page: MessagePage,
  file: string,
  name: string,
  list: readonly string[] | undefined = (SCREEN_MESSAGES as Record<string, readonly string[]>)[name],
): string[] {
  if (list === undefined) return [`no SCREEN_MESSAGES entry "${name}"`];
  return missingIn([file], [...SHARED_PREFIXES, ...PAGE_MESSAGES[page], ...list]);
}

const PAGES = Object.keys(PAGE_MESSAGES) as MessagePage[];

describe('EZD-1995 AC-2: every page list holds every message its page can use', () => {
  for (const page of PAGES) {
    it(`${page}: a page renders with pageMessages('${page}')`, () => {
      expect(entriesOf(page).map(rel)).not.toEqual([]);
    });

    it(`${page}: no message the page or its imports use is left out`, () => {
      expect(missingFor(page), `add these prefixes to PAGE_MESSAGES.${page}`).toEqual([]);
    });
  }

  it('the check fails, naming the key and its file, when a page list leaves out a message its page uses', () => {
    const without = PAGE_MESSAGES.projects.filter((p) => p !== 'office.projects.');
    const missing = missingFor('projects', without);
    expect(missing.some((m) => /^office\.projects\.title \(components\/projects\/\w+\.tsx\)$/.test(m))).toBe(true);
    expect(missing.some((m) => m.startsWith('office.projects.status.* ('))).toBe(true);
  });

  it('every lazy screen holds, with the page that opens it, every message the screen can use', () => {
    const seen = new Set<string>();
    for (const page of PAGES) {
      for (const [file, name] of screensOf(page)) {
        seen.add(name);
        expect(
          missingForScreen(page, file, name),
          `add these prefixes to SCREEN_MESSAGES['${name}'] (opened from the ${page} page)`,
        ).toEqual([]);
      }
    }
    // Every list is in use, and every screen file has a list.
    expect([...seen].sort()).toEqual(Object.keys(SCREEN_MESSAGES).sort());
    const files = readdirSync(join(SRC, 'lib/messages/screens'))
      .filter((f) => f.endsWith('.messages.ts'))
      .map((f) => f.replace(/\.messages\.ts$/, ''));
    expect(files.sort()).toEqual(Object.keys(SCREEN_MESSAGES).sort());
  });

  it('the check fails, naming the key and its file, when a screen list leaves out a message its screen uses', () => {
    const screens = screensOf('editor');
    const file = [...screens].find(([, name]) => name === 'countertops')?.[0];
    expect(file).toBeDefined();
    const missing = missingForScreen('editor', file as string, 'countertops', []);
    expect(missing.some((m) => m.startsWith('office.countertops.'))).toBe(true);
    expect(missingForScreen('editor', file as string, 'nope')).toEqual(['no SCREEN_MESSAGES entry "nope"']);
  });

  it('every screen prefix names at least one office message, and a screen never holds a dev message', () => {
    for (const [name, list] of Object.entries(SCREEN_MESSAGES) as [MessageScreen, readonly string[]][]) {
      for (const p of list) {
        expect(OFFICE_KEYS.some((k) => k.startsWith(p)), `${name}: ${p}`).toBe(true);
      }
    }
  });

  it('every UNRESOLVED_PREFIXES prefix names at least one message', () => {
    for (const [file, prefixes] of Object.entries(UNRESOLVED_PREFIXES)) {
      for (const p of prefixes) expect(KEYS.some((k) => k.startsWith(p)), `${file}: ${p}`).toBe(true);
    }
  });

  it('every page prefix names at least one message', () => {
    for (const page of PAGES) {
      for (const p of PAGE_MESSAGES[page] as readonly string[]) {
        expect(
          OFFICE_KEYS.some((k) => k.startsWith(p)),
          `${page}: ${p}`,
        ).toBe(true);
      }
    }
  });
});

describe('EZD-1995 AC-2: the reader finds what a page uses', () => {
  const tmp = (name: string) => join(SRC, 'server/messages', name);

  it('finds a full key, a template prefix, a joined prefix and an unreadable template', () => {
    const uses = usesOf([tmp('message-usage.fixture.test-helpers.ts')], KEYS);
    expect([...uses.keys.keys()]).toContain('office.projects.title');
    expect([...uses.prefixes.keys()]).toContain('office.users.perm.');
    expect([...uses.prefixes.keys()]).toContain('office.device.');
    expect(uses.unresolved.join('\n')).toContain('.offline_icon.');
    expect([...uses.apiUrls]).toContain('/api/projects/x/sync-conflicts');
  });

  it('cuts the graph at withScreenMessages and follows plain lazy imports', () => {
    const graph = pageGraph([tmp('message-usage.fixture.test-helpers.ts')]);
    expect([...graph.deferredScreens].map(([file, name]) => [rel(file), name])).toEqual([
      ['lazy/countertops/index.ts', 'countertops'],
    ]);
    expect([...graph.files].map(rel)).toContain('lazy/versions/index.ts');
    expect([...graph.files].map(rel)).not.toContain('lazy/countertops/index.ts');
  });

  it('follows imports into the geometry package, which names keys', () => {
    const graph = pageGraph([join(SRC, 'server/messages/message-usage.fixture.test-helpers.ts')]);
    expect([...graph.files].some((f) => f.endsWith('packages/geometry/src/length.ts'))).toBe(true);
    expect([...usesOf(graph.files, KEYS).keys.keys()]).toContain('office.length.refused');
  });

  it('maps an /api/ address to its route handler', () => {
    expect(apiRoutesFor(['/api/projects/x/sync-conflicts']).map(rel)).toEqual([
      'app/api/projects/[id]/sync-conflicts/route.ts',
    ]);
  });
});
