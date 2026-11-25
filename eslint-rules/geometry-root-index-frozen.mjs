// EZD-1905 (AC-EZD-1905-2; editor consolidation plan, first audit W2): packages/geometry/src/index.ts is frozen. Every
// ticket that added a geometry module used to add a line here, so lanes queued behind each other on one file. A new
// area is a folder with an index.ts, imported as `@ezdraft/geometry/<area>` (the package's "./*" export). Reported:
// any export statement in the root index other than `export * from` one of the sources it had on 2026-11-24.
export const FROZEN_ROOT_EXPORTS = Object.freeze([
  './ceiling',
  './cabinets/elevation',
  './cabinets/run',
  './cabinets/edit',
  './cabinets/hosting',
  './cabinets/fit',
  './cabinets/autofill',
  './countertops/piece',
  './countertops/outline',
  './countertops/trace',
  './countertops/seam',
  './countertops/cutout',
  './countertops/panel',
  './countertops/schedule',
  './countertops/overhang',
  './countertops/support',
  './countertops/edge-profile',
  './derived',
  './drawing',
  './fixtures',
  './code-check',
  './length',
  './moves',
  './numbers',
  './openings',
  './plumbing/diagram',
  './plumbing/locations',
  './rooms',
  './rules/bearing',
  './schema',
  './options/apply',
  './selection',
  './sketch',
  './snap/index',
  './tile',
  './tolerance',
  './walls',
  './turn',
  './scene3d/wall-face',
  './scene3d/ceiling-mesh',
  './drawing/symbol-key',
]);

const FROZEN = new Set(FROZEN_ROOT_EXPORTS);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'No new export line in the geometry root index; import new areas by subpath.',
    },
    schema: [],
    messages: {
      newExport:
        'The geometry root index is frozen (EZD-1905). Put the module in a folder with an index.ts and import it as @ezdraft/geometry/<area>.',
    },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'newExport' });
    return {
      ExportAllDeclaration(node) {
        if (node.exported || node.exportKind === 'type' || !FROZEN.has(node.source.value))
          report(node);
      },
      ExportNamedDeclaration: report,
      ExportDefaultDeclaration: report,
      TSExportAssignment: report,
    };
  },
};
