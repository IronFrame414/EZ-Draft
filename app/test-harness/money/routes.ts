// EZD-133 section 3 harness row `money/routes.ts` (vault/plans/EZD-133.md): list every exported HTTP method of
// every `route.ts` under `<appSrcDir>/app/` and compare with the money route cases. Export forms as
// `writeMethodsIn` in app/test-harness/permissions/write-routes.ts; `export * from` counts as '*'. Paths are
// repo-relative (`app/src/` + the path below appSrcDir). Test-only.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RouteMethod = { file: string; method: HttpMethod | '*' };

export function routeMethodsIn(source: string): (HttpMethod | '*')[] {
  const found = new Set<string>();
  for (const m of HTTP_METHODS) {
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
      if (exported && (HTTP_METHODS as readonly string[]).includes(exported)) found.add(exported);
    }
  }
  const out: (HttpMethod | '*')[] = HTTP_METHODS.filter((m) => found.has(m));
  if (/\bexport\s*\*\s*from\b/.test(source)) out.push('*');
  return out;
}

export function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export const repoRelative = (appSrcDir: string, file: string): string =>
  ['app', 'src', ...path.relative(appSrcDir, file).split(path.sep)].join('/');

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function listRouteMethods(appSrcDir: string): RouteMethod[] {
  const out: RouteMethod[] = [];
  for (const file of walkFiles(path.join(appSrcDir, 'app'))) {
    if (path.basename(file) !== 'route.ts') continue;
    const rel = repoRelative(appSrcDir, file);
    for (const method of routeMethodsIn(readFileSync(file, 'utf8'))) out.push({ file: rel, method });
  }
  return out.sort((a, b) => byText(a.file, b.file) || byText(a.method, b.method));
}

export function uncoveredRoutes(
  appSrcDir: string,
  cases: readonly { file: string; method: string }[],
): { missing: RouteMethod[]; stale: { file: string; method: string }[] } {
  const listed = listRouteMethods(appSrcDir);
  const key = (c: { file: string; method: string }) => `${c.method} ${c.file}`;
  const have = new Set(cases.map(key));
  const real = new Set(listed.map(key));
  return {
    missing: listed.filter((r) => !have.has(key(r))),
    stale: cases.filter((c) => !real.has(key(c))).map((c) => ({ file: c.file, method: c.method })),
  };
}
