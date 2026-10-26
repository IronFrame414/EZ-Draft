// EZD-020 Step 4 (vault/plans/EZD-020.md): refuses static imports of heavy libraries outside their lazy places,
// static imports of a lazy module from outside its folder, and editor code outside the editor (11 Performance
// rule 7). Options come from eslint-rules/boundaries.mjs. `import()` and type-only imports are never reported.
// EZD-167: also resolves the tsconfig path aliases in PATH_ALIASES (passed as the `aliases` option).
import path from 'node:path';
import { findHeavy } from './boundaries.mjs';

const toPosix = (p) => p.split(path.sep).join('/');
const startsWithAny = (p, prefixes) => prefixes.some((x) => p.startsWith(x));

function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specs = node.specifiers ?? [];
  if (specs.length === 0) return false;
  return specs.every((s) => s.importKind === 'type' || s.exportKind === 'type');
}

const rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          packages: { type: 'array' },
          lazyRoot: { type: 'string' },
          editorCode: { type: 'array', items: { type: 'string' } },
          editorCodeImporters: { type: 'array', items: { type: 'string' } },
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
        required: [
          'rootDir',
          'packages',
          'lazyRoot',
          'editorCode',
          'editorCodeImporters',
          'aliases',
        ],
        additionalProperties: false,
      },
    ],
    messages: {
      heavyPackage:
        '"{{spec}}" may be imported statically only in {{allowed}}; load it with import() through a lazy module (11 Performance rule 7; EZD-020).',
      lazyStatic:
        'A lazy module ({{module}}) is reached only by import() from outside its folder (11 Performance rule 7; EZD-020).',
      editorOnly:
        "Editor code ({{prefix}}) may not be imported here: it would enter another entry's bundle (11 Performance rule 7; EZD-020).",
    },
  },
  create(context) {
    const opts = context.options[0];
    const file = toPosix(path.relative(opts.rootDir, context.filename));
    const dir = path.posix.dirname(file);

    // A relative spec joins to its folder; a spec under a PATH_ALIASES prefix joins to the alias target (EZD-167).
    // The first alias that applies to this file and matches the spec wins. Returns null for a package spec.
    function resolveTarget(spec) {
      if (spec.startsWith('.')) return path.posix.join(dir, spec);
      const alias = opts.aliases.find(
        (a) => file.startsWith(a.appliesTo) && spec.startsWith(a.prefix),
      );
      if (alias) return path.posix.join(alias.target, spec.slice(alias.prefix.length));
      return null;
    }

    function check(node, spec) {
      if (typeof spec !== 'string') return;
      const target = resolveTarget(spec);
      if (target !== null) {
        const withSlash = target + '/';
        if (withSlash.startsWith(opts.lazyRoot)) {
          const name = withSlash.slice(opts.lazyRoot.length).split('/')[0];
          const moduleDir = `${opts.lazyRoot}${name}/`;
          if (name !== '' && !file.startsWith(moduleDir)) {
            context.report({ node, messageId: 'lazyStatic', data: { module: moduleDir } });
            return;
          }
        }
        const prefix = opts.editorCode.find((p) => withSlash.startsWith(p));
        if (prefix && !startsWithAny(file, opts.editorCodeImporters)) {
          context.report({ node, messageId: 'editorOnly', data: { prefix } });
        }
        return;
      }
      const hit = findHeavy(spec, opts.packages);
      if (hit && !startsWithAny(file, hit.entry.allowed)) {
        context.report({
          node,
          messageId: 'heavyPackage',
          data: { spec, allowed: hit.entry.allowed.join(', ') },
        });
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
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          check(node, node.arguments[0].value);
        }
      },
    };
  },
};

export default rule;
