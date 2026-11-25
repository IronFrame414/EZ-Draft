// EZD-1932 (audit 2026-11-23 S8; AC-EZD-1932-3): a 'use client' file may not import server-only code. Reported:
// a value import of the `server-only` package itself, and a value import (relative or a PATH_ALIASES alias) that
// resolves to a file whose code imports 'server-only' (the secret-key files server/auth/admin-auth.ts and
// server/jobs/db.ts, and any later one). Direct imports only; the Next build catches the deeper chain through the
// package. Type-only imports are erased and never reported.
import fs from 'node:fs';
import path from 'node:path';

const toPosix = (p) => p.split(path.sep).join('/');
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const MARKER = /^\s*import\s+['"]server-only['"]\s*;?\s*$/m;
const markerCache = new Map();

function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specs = node.specifiers ?? [];
  if (specs.length === 0) return false;
  return specs.every((s) => s.importKind === 'type' || s.exportKind === 'type');
}

function staticSpec(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function hasUseClient(program) {
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break;
    if (statement.directive === 'use client') return true;
  }
  return false;
}

function isServerOnlyFile(abs) {
  if (markerCache.has(abs)) return markerCache.get(abs);
  let found = false;
  for (const ext of EXTENSIONS) {
    const candidate = abs + ext;
    let stat;
    try {
      stat = fs.statSync(candidate);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    found = MARKER.test(fs.readFileSync(candidate, 'utf8'));
    break;
  }
  markerCache.set(abs, found);
  return found;
}

const rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          aliases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                prefix: { type: 'string' },
                target: { type: 'string' },
                appliesTo: { type: 'string' },
              },
              required: ['prefix', 'target', 'appliesTo'],
              additionalProperties: false,
            },
          },
        },
        required: ['rootDir', 'aliases'],
        additionalProperties: false,
      },
    ],
    messages: {
      serverOnlyPackage:
        "A 'use client' file may not import 'server-only'; move this code to a server file (EZD-1932).",
      serverOnlyModule:
        "A 'use client' file may not import \"{{spec}}\": it is server-only (it may hold the secret key); call a server route instead (EZD-1932).",
    },
  },
  create(context) {
    const program = context.sourceCode.ast;
    if (!hasUseClient(program)) return {};
    const opts = context.options[0];
    const file = toPosix(path.relative(opts.rootDir, context.filename));
    const dir = path.posix.dirname(file);

    function resolveTarget(spec) {
      if (spec.startsWith('.')) return path.posix.join(dir, spec);
      const alias = opts.aliases.find((a) => file.startsWith(a.appliesTo) && spec.startsWith(a.prefix));
      if (alias) return path.posix.join(alias.target, spec.slice(alias.prefix.length));
      return null;
    }

    function check(node, spec) {
      if (typeof spec !== 'string') return;
      if (spec === 'server-only') {
        context.report({ node, messageId: 'serverOnlyPackage' });
        return;
      }
      const target = resolveTarget(spec);
      if (target && isServerOnlyFile(path.join(opts.rootDir, target))) {
        context.report({ node, messageId: 'serverOnlyModule', data: { spec } });
      }
    }

    return {
      ImportDeclaration(node) {
        if (!isTypeOnly(node)) check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source && !isTypeOnly(node)) check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (!isTypeOnly(node)) check(node, node.source.value);
      },
      ImportExpression(node) {
        check(node, staticSpec(node.source));
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          check(node, staticSpec(node.arguments[0]));
        }
      },
    };
  },
};

export default rule;
