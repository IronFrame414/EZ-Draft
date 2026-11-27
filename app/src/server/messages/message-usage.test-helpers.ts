// EZD-1995 (AC-EZD-1995-2; audit 2026-11-26 F1; Q-0814): finds the screen messages a page can use, by reading its
// source. Starting from a page's files it follows every import (static, `import()` and lazyModule), except a lazy
// screen loaded through withScreenMessages(import('<x>.messages'), import('<screen>')), which loads its own messages
// with its code. In every file it reaches it collects the message keys written out in full, the key prefixes a key
// is built from (`office.users.perm.${p}`, or a literal such as 'office.device' joined to more text), the templates
// whose start it cannot read, and the /api/ addresses the page calls (an answer may carry message keys). Used by
// tests only.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** The geometry package's source (`@ezdraft/geometry` and `@ezdraft/geometry/<sub>`); some of it names keys. */
const GEOMETRY = resolve(SRC, '../../packages/geometry/src');

const NAMESPACE = /^(common|field|client|office|error|dev)\.[a-z0-9_.]*$/;
const KEY_TAIL = /^\.[a-z0-9_]+\./;
const KEY_HEAD = /^[a-z0-9_.]*$/;
const TEST_FILE = /\.(test|spec)\.|\.test-helpers\./;
/** Files whose key-shaped text is not a use: the catalogs and the page lists themselves. */
const NOT_USES = [
  'server/messages/catalogs/',
  'server/messages/page-messages.ts',
  'server/messages/screen-prefixes.ts',
  'server/messages/message-usage.test-helpers.ts',
];

export type FileScan = {
  imports: string[];
  /** `withScreenMessages(import('<name>.messages'), import('<spec>'))` calls: the screen's name and its code. */
  deferred: { screen: string; spec: string }[];
  literals: string[];
  templateHeads: string[];
  /** Templates whose start is not readable but whose text continues like a key (`${labels}.offline_icon.x`). */
  unresolved: string[];
  apiUrls: string[];
};

const scans = new Map<string, FileScan>();

const MESSAGES_FILE = /(?:^|\/)([a-z0-9-]+)\.messages$/;

function importSpec(node: ts.Node | undefined): string | null {
  if (
    node &&
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

export function scanFile(file: string): FileScan {
  const cached = scans.get(file);
  if (cached) return cached;
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const scan: FileScan = {
    imports: [],
    deferred: [],
    literals: [],
    templateHeads: [],
    unresolved: [],
    apiUrls: [],
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      if (!n.importClause?.isTypeOnly) scan.imports.push(n.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      if (!n.isTypeOnly) scan.imports.push(n.moduleSpecifier.text);
      return;
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'withScreenMessages'
    ) {
      const messages = importSpec(n.arguments[0]);
      const spec = importSpec(n.arguments[1]);
      const name = messages === null ? null : MESSAGES_FILE.exec(messages);
      if (name && spec !== null) {
        scan.deferred.push({ screen: name[1], spec });
        return;
      }
    }
    const dynamic = importSpec(n);
    if (dynamic !== null) {
      scan.imports.push(dynamic);
      return;
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      scan.literals.push(n.text);
      if (n.text.startsWith('/api/')) scan.apiUrls.push(n.text);
    } else if (ts.isTemplateExpression(n)) {
      const head = n.head.text;
      if (head.startsWith('/api/')) {
        scan.apiUrls.push(head + n.templateSpans.map((s) => `x${s.literal.text}`).join(''));
      } else if (NAMESPACE.test(head)) {
        scan.templateHeads.push(head);
      } else if (KEY_HEAD.test(head) && n.templateSpans.some((s) => KEY_TAIL.test(s.literal.text))) {
        scan.unresolved.push(n.getText(source));
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  scans.set(file, scan);
  return scan;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];

/** The source file an import names, or null for another package. */
export function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec === '@ezdraft/geometry') base = join(GEOMETRY, 'index');
  else if (spec.startsWith('@ezdraft/geometry/')) base = join(GEOMETRY, spec.slice('@ezdraft/geometry/'.length), 'index');
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    try {
      if (statSync(candidate).isFile()) {
        return candidate.startsWith(SRC) || candidate.startsWith(GEOMETRY) ? candidate : null;
      }
    } catch {
      // try the next extension
    }
  }
  return null;
}

export type PageGraph = { files: Set<string>; deferredScreens: Map<string, string> };

/** Every file the entries reach, and the lazy screens (file -> screen name) that load their own messages. */
export function pageGraph(entries: readonly string[]): PageGraph {
  const files = new Set<string>();
  const deferredScreens = new Map<string, string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const scan = scanFile(file);
    for (const spec of scan.imports) {
      const target = resolveImport(file, spec);
      if (target && !TEST_FILE.test(target)) stack.push(target);
    }
    for (const d of scan.deferred) {
      const target = resolveImport(file, d.spec);
      if (target) deferredScreens.set(target, d.screen);
    }
  }
  return { files, deferredScreens };
}

export function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !TEST_FILE.test(e.name)) out.push(p);
  }
  return out;
}

export const rel = (file: string): string => relative(SRC, file).split(sep).join('/');


export type Uses = {
  /** Keys written out in full, with a file that uses each. */
  keys: Map<string, string>;
  /** Prefixes a key is built from, with a file that uses each. */
  prefixes: Map<string, string>;
  /** Unreadable key templates, `file: text`. */
  unresolved: string[];
  apiUrls: Set<string>;
};

/** The messages the files can use. `catalogKeys` tells a key from other text that looks like one. */
export function usesOf(files: Iterable<string>, catalogKeys: readonly string[]): Uses {
  const keySet = new Set(catalogKeys);
  const uses: Uses = { keys: new Map(), prefixes: new Map(), unresolved: [], apiUrls: new Set() };
  const addPrefix = (prefix: string, file: string): void => {
    if (catalogKeys.some((k) => k.startsWith(prefix)) && !uses.prefixes.has(prefix)) uses.prefixes.set(prefix, file);
  };
  for (const file of files) {
    const name = rel(file);
    if (NOT_USES.some((p) => name.startsWith(p))) continue;
    const scan = scanFile(file);
    for (const literal of scan.literals) {
      if (keySet.has(literal)) {
        if (!uses.keys.has(literal)) uses.keys.set(literal, name);
      } else if (NAMESPACE.test(literal)) {
        addPrefix(/[._]$/.test(literal) ? literal : `${literal}.`, name);
      }
    }
    for (const head of scan.templateHeads) addPrefix(head, name);
    for (const text of scan.unresolved) uses.unresolved.push(`${name}: ${text}`);
    for (const url of scan.apiUrls) uses.apiUrls.add(url);
  }
  return uses;
}

const ROUTE_FILE = /^route\.tsx?$/;

/** The route handlers under app/ that answer the page's /api/ addresses. */
export function apiRoutesFor(urls: Iterable<string>): string[] {
  const appDir = join(SRC, 'app');
  const handlers = sourceFiles(appDir).filter((f) => ROUTE_FILE.test(f.slice(f.lastIndexOf(sep) + 1)));
  const patterns = handlers.map((file) => {
    const parts = relative(appDir, dirname(file))
      .split(sep)
      .filter((s) => !/^\(.*\)$/.test(s))
      .map((s) => {
        if (/^\[\[?\.\.\./.test(s)) return '.+';
        if (/^\[.*\]$/.test(s)) return '[^/]+';
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
    return { file, re: new RegExp(`^/${parts.join('/')}$`) };
  });
  const out = new Set<string>();
  for (const url of urls) {
    const path = url.split('?')[0].replace(/\/$/, '');
    for (const p of patterns) if (p.re.test(path)) out.add(p.file);
  }
  return [...out];
}

const ROUTE_SEGMENT_FILE = /^(page|layout|loading|error|not-found|template|default)\.tsx?$/;

/** The page, layout and other route files under a layout's folder. */
export function routeFilesUnder(layout: string): string[] {
  return sourceFiles(dirname(layout)).filter((f) =>
    ROUTE_SEGMENT_FILE.test(f.slice(f.lastIndexOf(sep) + 1)),
  );
}
