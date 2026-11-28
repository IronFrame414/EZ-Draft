// EZD-2000 (AC-EZD-2000-1 (3); Q-0814 "server pages start independent reads together"; audit 2026-11-26 F4): a
// server page or layout does not await two independent reads one after another. Reported: in one block, an
// `await` statement whose awaited expression uses nothing an earlier awaited read in the same block produced.
//
// A read is a statement that awaits and keeps the result: `const x = await f()`, `x = await f()`. A later await
// statement (any of `const y = await g()`, `y = await g()`, `await g()`, `return await g()`) depends on it when its
// awaited expression names a value the read declared, directly or through declarations in between
// (`const a = await f(); const id = a.id; const b = await g(id)`), or when a statement in between names one of
// those values (a guard like `if (!user) redirect('/sign-in')` makes what follows wait on purpose). Awaiting a
// promise started earlier (`await aRead`, `await Promise.all([aRead, bRead])`) starts nothing and is never reported.
// Request values are not reads and are never reported: `await params`, `await searchParams`, `await props.params`,
// `await cookies()`, `await headers()`, `await connection()`, `await draftMode()`.
// Escape: a line comment directly above the later await, `// sequential-await: <reason>`, with the reason written.
// A 'use client' file is skipped.

const REQUEST_CALLS = new Set(['cookies', 'headers', 'connection', 'draftMode']);
const REQUEST_VALUES = new Set(['params', 'searchParams']);
const ESCAPE = /^\s*sequential-await:\s*(.*)$/;

/** The awaited expression of a statement that awaits at its top, or null. */
function awaitedOf(stmt) {
  const unwrap = (e) => (e && e.type === 'AwaitExpression' ? e.argument : null);
  if (stmt.type === 'VariableDeclaration' && stmt.declarations.length === 1) {
    const d = stmt.declarations[0];
    const arg = unwrap(d.init);
    return arg ? { arg, binds: d.id } : null;
  }
  if (stmt.type === 'ExpressionStatement') {
    const e = stmt.expression;
    if (e.type === 'AssignmentExpression' && e.operator === '=') {
      const arg = unwrap(e.right);
      return arg ? { arg, binds: e.left } : null;
    }
    const arg = unwrap(e);
    return arg ? { arg, binds: null } : null;
  }
  if (stmt.type === 'ReturnStatement') {
    const arg = unwrap(stmt.argument);
    return arg ? { arg, binds: null } : null;
  }
  return null;
}

/** True for `params`, `props.params`, `cookies()` and the other request values. */
function isRequestValue(arg) {
  if (arg.type === 'Identifier') return REQUEST_VALUES.has(arg.name);
  if (arg.type === 'MemberExpression' && !arg.computed && arg.property.type === 'Identifier') {
    return REQUEST_VALUES.has(arg.property.name);
  }
  if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier') {
    return REQUEST_CALLS.has(arg.callee.name);
  }
  return false;
}

const PROMISE_COMBINATORS = new Set(['all', 'allSettled', 'any', 'race']);

/**
 * True when awaiting `expr` starts work then: it calls something. Awaiting a promise started earlier
 * (`await aRead`, `await Promise.all([aRead, bRead])`) starts nothing, so it never waits on purpose.
 */
function startsWork(expr) {
  if (!expr || typeof expr.type !== 'string') return false;
  switch (expr.type) {
    case 'Identifier':
    case 'Literal':
    case 'ThisExpression':
      return false;
    case 'MemberExpression':
      return startsWork(expr.object) || (expr.computed && startsWork(expr.property));
    case 'CallExpression': {
      const c = expr.callee;
      const combinator =
        c.type === 'MemberExpression' &&
        !c.computed &&
        c.object.type === 'Identifier' &&
        c.object.name === 'Promise' &&
        c.property.type === 'Identifier' &&
        PROMISE_COMBINATORS.has(c.property.name);
      if (!combinator) return true;
      return expr.arguments.some((a) =>
        a.type === 'ArrayExpression'
          ? a.elements.some((e) => startsWork(e && e.type === 'SpreadElement' ? e.argument : e))
          : startsWork(a),
      );
    }
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression':
      return startsWork(expr.expression);
    case 'ConditionalExpression':
      return startsWork(expr.test) || startsWork(expr.consequent) || startsWork(expr.alternate);
    case 'LogicalExpression':
    case 'BinaryExpression':
      return startsWork(expr.left) || startsWork(expr.right);
    default:
      return true;
  }
}

/** Names a binding pattern declares (`a`, `{ a, b: c }`, `[a, ...b]`), or an assigned identifier. */
function boundNames(pattern, out = new Set()) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.add(pattern.name);
      break;
    case 'ObjectPattern':
      for (const p of pattern.properties)
        boundNames(p.type === 'RestElement' ? p.argument : p.value, out);
      break;
    case 'ArrayPattern':
      for (const e of pattern.elements) boundNames(e, out);
      break;
    case 'RestElement':
      boundNames(pattern.argument, out);
      break;
    case 'AssignmentPattern':
      boundNames(pattern.left, out);
      break;
    case 'MemberExpression': {
      let o = pattern;
      while (o.type === 'MemberExpression') o = o.object;
      if (o.type === 'Identifier') out.add(o.name);
      break;
    }
    default:
      break;
  }
  return out;
}

/** True when `node` names any identifier in `names` (a plain walk of the syntax tree). */
function mentions(node, names) {
  if (names.size === 0) return false;
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n.type !== 'string') continue;
    if (n.type === 'Identifier' && names.has(n.name)) return true;
    for (const key of Object.keys(n)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      const v = n[key];
      if (Array.isArray(v)) for (const c of v) stack.push(c);
      else if (v && typeof v.type === 'string') stack.push(v);
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A server page or layout starts independent reads together (Promise.all), not one after another (Q-0814).',
    },
    schema: [],
    messages: {
      sequential:
        'This await does not use the result of the read on line {{line}}, so the two wait one after the other; start them together (Promise.all) or write `// sequential-await: <reason>` above it (Q-0814; AC-EZD-2000-1).',
      noReason:
        'A `// sequential-await:` comment must name the reason the reads wait one after the other.',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    let client = false;

    function escapeOf(stmt) {
      const comments = source.getCommentsBefore(stmt);
      const last = comments[comments.length - 1];
      if (!last || last.type !== 'Line') return null;
      if (
        last.loc.end.line !== stmt.loc.start.line - 1 &&
        last.loc.end.line !== stmt.loc.start.line
      )
        return null;
      const m = ESCAPE.exec(last.value);
      if (!m) return null;
      return { comment: last, reason: m[1].trim() };
    }

    function checkBlock(statements) {
      // Each earlier read: the names it (and declarations from it) produced, and its line.
      const reads = [];
      for (const stmt of statements) {
        const awaited = awaitedOf(stmt);
        if (awaited && !isRequestValue(awaited.arg)) {
          const independent = startsWork(awaited.arg)
            ? reads.find((r) => !mentions(awaited.arg, r.names))
            : undefined;
          if (independent) {
            const esc = escapeOf(stmt);
            if (!esc) {
              context.report({
                node: stmt,
                messageId: 'sequential',
                data: { line: String(independent.line) },
              });
            } else if (esc.reason.length === 0) {
              context.report({ node: esc.comment, messageId: 'noReason' });
            }
          }
          if (awaited.binds) {
            reads.push({ names: boundNames(awaited.binds), line: stmt.loc.start.line });
          }
          continue;
        }
        // A statement in between: a declaration from a read's values joins that read; any other statement that
        // names a read's values makes what follows wait on it on purpose (a guard), so the read is settled.
        for (let i = reads.length - 1; i >= 0; i--) {
          const r = reads[i];
          if (!mentions(stmt, r.names)) continue;
          if (stmt.type === 'VariableDeclaration') {
            for (const d of stmt.declarations) boundNames(d.id, r.names);
          } else {
            reads.splice(i, 1);
          }
        }
      }
    }

    return {
      Program(node) {
        client = node.body.some(
          (s) => s.type === 'ExpressionStatement' && s.directive === 'use client',
        );
      },
      BlockStatement(node) {
        if (!client) checkBlock(node.body);
      },
    };
  },
};
