// EZD-026a · local ESLint plugin `ezdraft`: the repo's own rules (EZD-020 adds import-boundaries here).
import noLiteralUiString from './no-literal-ui-string.mjs';
import importBoundaries from './import-boundaries.mjs';

export default {
  meta: { name: 'ezdraft' },
  rules: { 'no-literal-ui-string': noLiteralUiString, 'import-boundaries': importBoundaries },
};
