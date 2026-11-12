// @ezdraft/geometry: pure TypeScript geometry core (no UI, no DOM, no Node APIs); first exports arrive with EZD-201 and EZD-202.
// EZD-204a Build step 6 (vault/plans/EZD-204a.md section 1, section 3): exports the openings core.
// EZD-208a Build step 2 (vault/plans/EZD-208a.md section 3 G1-G6): exports the pick shapes.
// EZD-212a Build step 9 (vault/plans/EZD-212a.md section 3): exports the moves core.
// EZD-235 Build step 4 (vault/plans/EZD-235.md Decided "D-Where"; 11 rule 2): exports the derived values.
export * from './benchmark/benchmark';
export * from './derived';
export * from './drawing';
export * from './length';
export * from './moves';
export * from './numbers';
export * from './openings';
export * from './rooms';
export * from './schema';
export * from './selection';
export * from './snap/index';
export * from './tolerance';
export * from './walls';
export * from './turn';
