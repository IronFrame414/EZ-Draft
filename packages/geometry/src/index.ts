// @ezdraft/geometry: pure TypeScript geometry core (no UI, no DOM, no Node APIs); first exports arrive with EZD-201 and EZD-202.
// EZD-204a Build step 6 (vault/plans/EZD-204a.md section 1, section 3): exports the openings core.
// EZD-208a Build step 2 (vault/plans/EZD-208a.md section 3 G1-G6): exports the pick shapes.
// EZD-212a Build step 9 (vault/plans/EZD-212a.md section 3): exports the moves core.
// EZD-235 Build step 4 (vault/plans/EZD-235.md Decided "D-Where"; 11 rule 2): exports the derived values.
// EZD-729 Build (AC-EZD-729-1): exports the plumbing locations.
// EZD-730 (AC-EZD-730-1, -2): exports the plumbing diagram.
// EZD-402 (AC-EZD-402-1): exports the cabinet run totals.
// EZD-404 (AC-EZD-404-2): exports the cabinet run plan strip and elevation layout.
// EZD-408 (AC-EZD-408-1): exports Auto-fill run.
// EZD-405 (AC-EZD-405-1): exports the cabinet box edits (resize with code update, reorder, delete, duplicate).
// EZD-411 (AC-EZD-411-1): exports the countertop piece measures.
// EZD-215 (AC-EZD-215-1, -2): exports the bearing wall rule.
// EZD-733 (AC-EZD-733-1): exports the tile layout pieces and cuts.
// EZD-505 (AC-EZD-505-1): exports the beam sets.
// EZD-1009 (AC-EZD-1009-2): exports the design option apply.
// EZD-229 (11 Budgets; EZD-120c B11): the benchmark model is its own entry, `@ezdraft/geometry/benchmark`, so the
// editor's first download does not carry the 3,000-object generator that only the lazy benchmark runner, the server
// and the dev pages use.
export * from './ceiling';
export * from './cabinets/elevation';
export * from './cabinets/run';
export * from './cabinets/edit';
export * from './cabinets/hosting';
export * from './cabinets/fit';
export * from './cabinets/autofill';
export * from './countertops/piece';
// EZD-412: Trace cabinets and Draw outline.
export * from './countertops/outline';
export * from './countertops/trace';
// EZD-413: seams and cutouts.
export * from './countertops/seam';
export * from './countertops/cutout';
// EZD-416: the left panel and status bar readouts.
export * from './countertops/panel';
// EZD-418: the top schedule rows.
export * from './countertops/schedule';
export * from './derived';
export * from './drawing';
export * from './fixtures';
export * from './length';
export * from './moves';
export * from './numbers';
export * from './openings';
export * from './plumbing/diagram';
export * from './plumbing/locations';
export * from './rooms';
export * from './rules/bearing';
export * from './schema';
// EZD-1009: design option patches applied for display.
export * from './options/apply';
export * from './selection';
export * from './sketch';
export * from './snap/index';
export * from './tile';
export * from './tolerance';
export * from './walls';
export * from './turn';
// EZD-1001a: the wall face the lazy 3D scene extrudes.
export * from './scene3d/wall-face';
