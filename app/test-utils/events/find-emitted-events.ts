// EZD-1314 (07 Hooks, Canonical names; AC-EZD-1314-1): every event name the TypeScript code emits, for the
// registry audit (app/src/lib/events/registry-audit.test.ts). Two readings:
// - `call`: the string literal that is the first argument of a bare `emit(` or `emitXxx(` call (an optional
//   `<…>` type argument and line breaks allowed), such as `emitProfileEvent(\n  'submittal_profile.created'`.
// - `name_property`: a `name: '<registered name>'` property, the shape the forwarders below read back as
//   `e.name` (role, member and engineer-note events). Only registered names count, so a `name:` that is not an
//   event is never read as one.
// A bare `emit(` call whose first argument is not a literal is returned in `forwarders`, so the audit can pin them
// and a new forwarder fails until it is looked at. An `emitXxx(` call without a literal (`emitFrame()`) is not an
// event call and is ignored. `function emit…(` declarations are neither.
// Same walk as find-unregistered-emits.ts: test files, node_modules, build output, test-utils and test-harness
// are skipped; `skipPaths` (repo-relative prefixes) skips more.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type EmittedEvent = {
  file: string;
  line: number;
  name: string;
  via: 'call' | 'name_property';
};
export type EmitForwarder = { file: string; line: number; callee: string };

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'test-utils',
  'test-harness',
  'fixtures',
  '__fixtures__',
]);
const TEST_FILE = /\.(test|spec)\.[^/]+$/;
const LITERAL = /^(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$\n]*)`)/;
const CALL = /(?<![.\w$])(emit(?:[A-Z]\w*)?)\s*(?:<[^<>()]*>)?\s*\(\s*/g;
const NAME_PROPERTY = /(?<![.\w$])name\s*:\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$\n]*)`)/g;

function expandRoot(rootDir: string, root: string): string[] {
  let current = [rootDir];
  for (const segment of root.split('/').filter(Boolean)) {
    const next: string[] = [];
    for (const base of current) {
      if (segment !== '*') {
        next.push(path.join(base, segment));
        continue;
      }
      let entries: string[] = [];
      try {
        entries = readdirSync(base);
      } catch {
        continue;
      }
      for (const e of entries)
        if (statSync(path.join(base, e)).isDirectory()) next.push(path.join(base, e));
    }
    current = next;
  }
  return current.filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name)) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

export function findEmittedEvents(
  rootDir: string,
  roots: string[],
  isRegistered: (name: string) => boolean,
  options?: { skipPaths?: string[] },
): { emitted: EmittedEvent[]; forwarders: EmitForwarder[] } {
  const files: string[] = [];
  for (const root of roots) for (const dir of expandRoot(rootDir, root)) walk(dir, files);
  const skip = (options?.skipPaths ?? []).map((p) => p.replace(/\/+$/, ''));
  const emitted: EmittedEvent[] = [];
  const forwarders: EmitForwarder[] = [];
  for (const abs of [...new Set(files)].sort()) {
    const file = path.relative(rootDir, abs).split(path.sep).join('/');
    if (skip.some((p) => file === p || file.startsWith(`${p}/`))) continue;
    const text = readFileSync(abs, 'utf8');
    for (const m of text.matchAll(CALL)) {
      const at = m.index ?? 0;
      if (/function\s*\*?\s*$/.test(text.slice(Math.max(0, at - 20), at))) continue;
      const argAt = at + m[0].length;
      const lit = LITERAL.exec(text.slice(argAt));
      if (lit) {
        emitted.push({
          file,
          line: lineAt(text, argAt),
          name: lit[1] ?? lit[2] ?? lit[3] ?? '',
          via: 'call',
        });
      } else if (m[1] === 'emit') {
        forwarders.push({ file, line: lineAt(text, at), callee: m[1] as string });
      }
    }
    for (const m of text.matchAll(NAME_PROPERTY)) {
      const name = m[1] ?? m[2] ?? m[3] ?? '';
      if (!isRegistered(name)) continue;
      emitted.push({ file, line: lineAt(text, m.index ?? 0), name, via: 'name_property' });
    }
  }
  const order = (a: { file: string; line: number }, b: { file: string; line: number }) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1;
  return { emitted: emitted.sort(order), forwarders: forwarders.sort(order) };
}
