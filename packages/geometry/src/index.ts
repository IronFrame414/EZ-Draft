// @ezdraft/geometry: pure TypeScript geometry core (no UI, no DOM, no Node APIs); first exports arrive with EZD-201 and EZD-202.
// EZD-204a Build step 6 (vault/plans/EZD-204a.md section 1, section 3): exports the openings core.
// EZD-208a Build step 2 (vault/plans/EZD-208a.md section 3 G1-G6): exports the pick shapes.
// EZD-212a Build step 9 (vault/plans/EZD-212a.md section 3): exports the moves core.
// EZD-235 Build step 4 (vault/plans/EZD-235.md Decided "D-Where"; 11 rule 2): exports the derived values.
// EZD-729 Build (AC-EZD-729-1): exports the plumbing locations.
// EZD-402 (AC-EZD-402-1): exports the cabinet run totals.
// EZD-404 (AC-EZD-404-2): exports the cabinet run plan strip and elevation layout.
// EZD-411 (AC-EZD-411-1): exports the countertop piece measures.
// EZD-229 (11 Budgets; EZD-120c B11): the benchmark model is its own entry, `@ezdraft/geometry/benchmark`, so the
// editor's first download does not carry the 3,000-object generator that only the lazy benchmark runner, the server
// and the dev pages use.
export * from './cabinets/elevation';
export * from './cabinets/run';
export * from './countertops/piece';
export * from './derived';
export * from './drawing';
export * from './fixtures';
export * from './length';
export * from './moves';
export * from './numbers';
export * from './openings';
export * from './plumbing/locations';
export * from './rooms';
export * from './schema';
export * from './selection';
export * from './sketch';
export * from './snap/index';
export * from './tolerance';
export * from './walls';
export * from './turn';
