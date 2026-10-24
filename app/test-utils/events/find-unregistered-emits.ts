// EZD-022 Step 3: static scan for bare emit('literal') calls whose name is not registered (vault/plans/EZD-022.md section 3).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type UnregisteredEmit = { file: string; line: number; name: string };

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
// A bare call: not preceded by "." or an identifier character, then a string literal.
const EMIT_CALL = /(?<![.\w$])emit\s*\(\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$\n]*)`)/g;

function expandRoot(rootDir: string, root: string): string[] {
  let current = [rootDir];
  for (const segment of root.split('/').filter(Boolean)) {
    const next: string[] = [];
    for (const base of current) {
      if (segment === '*') {
        let entries: string[] = [];
        try {
          entries = readdirSync(base);
        } catch {
          continue;
        }
        for (const e of entries) {
          const p = path.join(base, e);
          if (statSync(p).isDirectory()) next.push(p);
        }
      } else {
        next.push(path.join(base, segment));
      }
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

export function findUnregisteredEmits(
  rootDir: string,
  roots: string[],
  isRegistered: (name: string) => boolean,
  options?: { onFile?: (file: string) => void },
): UnregisteredEmit[] {
  const files: string[] = [];
  for (const root of roots) for (const dir of expandRoot(rootDir, root)) walk(dir, files);
  const found: UnregisteredEmit[] = [];
  for (const abs of files.sort()) {
    const rel = path.relative(rootDir, abs).split(path.sep).join('/');
    options?.onFile?.(rel);
    const text = readFileSync(abs, 'utf8');
    for (const m of text.matchAll(EMIT_CALL)) {
      const name = m[1] ?? m[2] ?? m[3] ?? '';
      if (isRegistered(name)) continue;
      const literalStart = (m.index ?? 0) + m[0].length - name.length - 1;
      const line = text.slice(0, literalStart).split('\n').length;
      found.push({ file: rel, line, name });
    }
  }
  return found;
}
