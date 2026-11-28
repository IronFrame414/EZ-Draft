// EZD-2000 (AC-EZD-2000-1 (4); Q-0814 "a page sends only its own messages"; audit 2026-11-26 F1; EZD-1995): a page
// or layout never hands the whole office catalog to a MessagesProvider. Reported: a JSX `messages={...}` whose value
// is `catalogFor('office', ...)` itself, or `catalogFor(<a surface that is not written out>, ...)`. The office and
// editor pages pass `pageMessages('<page>')` (server/messages/page-messages.ts); a helper that picks keys out of
// the catalog (the office layout's reload prompt) is not reported. The sign-in and field catalogs are those
// entries' own messages and stay as they are. Dev pages (404 in production, proxy.ts) are outside the rule's files.

function surfaceOf(call) {
  const first = call.arguments[0];
  if (first && first.type === 'Literal' && typeof first.value === 'string') return first.value;
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A page sends only its own messages, never the whole office catalog (Q-0814; EZD-1995).',
    },
    schema: [],
    messages: {
      wholeCatalog:
        "This hands the whole office catalog to the page; pass pageMessages('<page>') from server/messages/page-messages.ts (Q-0814; AC-EZD-2000-1).",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'messages') return;
        const v = node.value;
        if (!v || v.type !== 'JSXExpressionContainer') return;
        const e = v.expression;
        if (
          e.type !== 'CallExpression' ||
          e.callee.type !== 'Identifier' ||
          e.callee.name !== 'catalogFor'
        )
          return;
        const surface = surfaceOf(e);
        if (surface === null || surface === 'office')
          context.report({ node, messageId: 'wholeCatalog' });
      },
    };
  },
};
