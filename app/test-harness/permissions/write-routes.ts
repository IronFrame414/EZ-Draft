// EZD-102 section 3 harness row (vault/plans/EZD-102.md; Decided "Which writes need it"): find write paths
// that skip the server permission check. A route file is any `route.ts` under `<appSrcDir>/app/`; a write
// method is an exported POST, PUT, PATCH or DELETE (`export async function X`, `export function X`,
// `export const X =`, `export { a as X }`). A `'use server'` file is any file under `<appSrcDir>/` whose
// first statement is that directive; it is always reported (Server Actions are never a write path).
// Paths are repo-relative: `app/src/` + the path below appSrcDir, with `/` separators. Test-only.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

export function writeMethodsIn(source: string): string[] {
  const found = new Set<string>();
  for (const m of WRITE_METHODS) {
    if (new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s*\\*?\\s*${m}\\b`).test(source)) {
      found.add(m);
    }
    if (new RegExp(`\\bexport\\s+const\\s+${m}\\s*[=:]`).test(source)) found.add(m);
  }
  for (const block of source.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of block[1].split(',')) {
      const exported = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (exported && (WRITE_METHODS as readonly string[]).includes(exported)) found.add(exported);
    }
  }
  return WRITE_METHODS.filter((m) => found.has(m));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Comments and blank space before the first statement are skipped.
function hasUseServerDirective(source: string): boolean {
  const body = source.replace(/^(?:\s+|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '');
  return /^(['"])use server\1/.test(body);
}

const repoRelative = (appSrcDir: string, file: string) =>
  ['app', 'src', ...path.relative(appSrcDir, file).split(path.sep)].join('/');

export function uncheckedWrites(appSrcDir: string, exempt: readonly string[]): string[] {
  const skip = new Set(exempt);
  const out = new Set<string>();
  for (const file of walk(appSrcDir)) {
    if (!SOURCE_FILE.test(file)) continue;
    const rel = repoRelative(appSrcDir, file);
    const source = readFileSync(file, 'utf8');
    const isRoute = rel.startsWith('app/src/app/') && path.basename(file) === 'route.ts';
    if (isRoute && writeMethodsIn(source).length > 0 && !source.includes('requireApiPermission(')) {
      out.add(rel);
    }
    if (hasUseServerDirective(source)) out.add(rel);
  }
  return [...out].filter((p) => !skip.has(p)).sort();
}
