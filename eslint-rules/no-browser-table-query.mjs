// EZD-133 Step 2 (vault/plans/EZD-133.md): browser code never queries tables (03b rule 1; R26 R1). Browser code is
// a file whose directive prologue holds 'use client' (that wins), or any file outside the `serverPaths` option
// (Decided D1). In browser code the rule reports each value import of the Supabase data client packages
// (dataClientImport, D3) and each call to a member `from`, `rpc` or `schema` (dataCall, D4). Type-only imports and
// `@supabase/realtime-js` are never reported; `from` on Array, Buffer or a typed array is not a table query.
import path from 'node:path';

const toPosix = (p) => p.split(path.sep).join('/');

const DATA_CLIENT_PACKAGES = ['@supabase/supabase-js', '@supabase/ssr', '@supabase/postgrest-js'];
const DATA_METHODS = new Set(['from', 'rpc', 'schema']);
const NOT_A_CLIENT = /^(Array|Buffer|[A-Z][A-Za-z0-9]*Array)$/;

function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specs = node.specifiers ?? [];
  if (specs.length === 0) return false;
  return specs.every((s) => s.importKind === 'type' || s.exportKind === 'type');
}

function isDataClient(spec) {
  return (
    typeof spec === 'string' &&
    DATA_CLIENT_PACKAGES.some((p) => spec === p || spec.startsWith(p + '/'))
  );
}

// A string literal or a template literal with no expressions; anything else is not read (Decided D5).
function staticSpec(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function hasUseClient(program) {
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break;
    if (statement.directive === 'use client') return true;
  }
  return false;
}

// A serverPaths entry ending in '/' is a folder; any other entry is one file.
function inServerPath(file, serverPaths) {
  return serverPaths.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
}

function memberName(member) {
  if (!member.computed) return member.property.type === 'Identifier' ? member.property.name : null;
  return member.property.type === 'Literal' && typeof member.property.value === 'string'
    ? member.property.value
    : null;
}

const rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          serverPaths: { type: 'array', items: { type: 'string' } },
        },
        required: ['rootDir', 'serverPaths'],
        additionalProperties: false,
      },
    ],
    messages: {
      dataClientImport:
        'Browser code may not import the Supabase data client ("{{spec}}"); call the app\'s own server routes instead (03b rule 1; EZD-133).',
      dataCall:
        "Browser code may not query the database (.{{method}}()); call the app's own server routes instead (03b rule 1; EZD-133).",
    },
  },
  create(context) {
    const opts = context.options[0];
    const file = toPosix(path.relative(opts.rootDir, context.filename));
    const program = context.sourceCode.ast;
    const browser = hasUseClient(program) || !inServerPath(file, opts.serverPaths);
    if (!browser) return {};

    function checkSpec(node, spec) {
      if (isDataClient(spec)) {
        context.report({ node, messageId: 'dataClientImport', data: { spec } });
      }
    }

    return {
      ImportDeclaration(node) {
        if (!isTypeOnly(node)) checkSpec(node, node.source.value);
      },
      TSImportEqualsDeclaration(node) {
        if (node.importKind === 'type') return;
        if (node.moduleReference.type !== 'TSExternalModuleReference') return;
        checkSpec(node, staticSpec(node.moduleReference.expression));
      },
      ExportNamedDeclaration(node) {
        if (node.source && !isTypeOnly(node)) checkSpec(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (!isTypeOnly(node)) checkSpec(node, node.source.value);
      },
      ImportExpression(node) {
        checkSpec(node, staticSpec(node.source));
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && callee.name === 'require') {
          checkSpec(node, staticSpec(node.arguments[0]));
          return;
        }
        if (callee.type !== 'MemberExpression') return;
        const method = memberName(callee);
        if (method === null || !DATA_METHODS.has(method)) return;
        if (callee.object.type === 'Identifier' && NOT_A_CLIENT.test(callee.object.name)) return;
        context.report({ node, messageId: 'dataCall', data: { method } });
      },
    };
  },
};

export default rule;
