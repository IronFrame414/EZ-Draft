// EZD-026a · local ESLint plugin `ezdraft`: the repo's own rules (EZD-020 adds import-boundaries here).
import noLiteralUiString from './no-literal-ui-string.mjs';
import importBoundaries from './import-boundaries.mjs';
import noBrowserTableQuery from './no-browser-table-query.mjs';
import noClientServerOnly from './no-client-server-only.mjs';
import geometryRootIndexFrozen from './geometry-root-index-frozen.mjs';
import parallelServerReads from './parallel-server-reads.mjs';
import pageOwnMessages from './page-own-messages.mjs';

export default {
  meta: { name: 'ezdraft' },
  rules: {
    'no-literal-ui-string': noLiteralUiString,
    'import-boundaries': importBoundaries,
    'no-browser-table-query': noBrowserTableQuery,
    'no-client-server-only': noClientServerOnly,
    'geometry-root-index-frozen': geometryRootIndexFrozen,
    'parallel-server-reads': parallelServerReads,
    'page-own-messages': pageOwnMessages,
  },
};
