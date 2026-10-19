// EZD-026a · phone-screen lint (vault/plans/EZD-026a.md Step 4; R26 R17).
// Reports words typed straight into a phone component instead of going through t().
const LETTER = /\p{L}/u;
const NAME_EXACT =
  /^(alt|title|placeholder|label|text|message|caption|heading|description|hint|tooltip|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/;
const NAME_SUFFIX =
  /[a-z0-9](Label|Title|Text|Message|Placeholder|Caption|Heading|Description|Hint|Tooltip)$/;

function isTextExpression(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' && LETTER.test(node.value);
    case 'TemplateLiteral':
      return node.quasis.some((q) => LETTER.test(q.value.cooked ?? q.value.raw));
    case 'ConditionalExpression':
      return isTextExpression(node.consequent) || isTextExpression(node.alternate);
    case 'LogicalExpression':
      return isTextExpression(node.left) || isTextExpression(node.right);
    default:
      return false;
  }
}

function literalKey(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

const rule = {
  meta: {
    type: 'problem',
    messages: {
      literal: 'Interface text must go through t(); do not type words into a phone component.',
      keyNamespace: 't() key "{{key}}" is outside the namespaces this folder may use.',
    },
    schema: [
      {
        type: 'object',
        properties: { allowedKeyPrefixes: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const prefixes = context.options[0]?.allowedKeyPrefixes;
    return {
      JSXText(node) {
        if (LETTER.test(node.value)) context.report({ node, messageId: 'literal' });
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        if (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment') return;
        if (isTextExpression(node.expression)) context.report({ node, messageId: 'literal' });
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const name = node.name.name;
        if (!NAME_EXACT.test(name) && !NAME_SUFFIX.test(name)) return;
        const value = node.value;
        if (!value) return;
        const bad =
          value.type === 'Literal'
            ? typeof value.value === 'string' && LETTER.test(value.value)
            : value.type === 'JSXExpressionContainer' && isTextExpression(value.expression);
        if (bad) context.report({ node, messageId: 'literal' });
      },
      CallExpression(node) {
        if (!prefixes || node.callee.type !== 'Identifier' || node.callee.name !== 't') return;
        const key = literalKey(node.arguments[0]);
        if (key === null) return;
        if (!prefixes.some((p) => key.startsWith(p))) {
          context.report({ node, messageId: 'keyNamespace', data: { key } });
        }
      },
    };
  },
};

export default rule;
