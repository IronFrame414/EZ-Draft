// EZD-017 Step 3 (vault/plans/EZD-017.md section 3 table R): every measurement the check reports, in order.
// A later ticket adds its collector in scripts/perf/ and switches its row from pending to active. Owner text is
// guidance for later planners, not a contract.

const row = (id, budget, status, collector, owner) => Object.freeze({ id, budget, status, owner, collector });

export const MEASUREMENTS = Object.freeze([
  row('react-commits-during-pan', 'react-commits.pan', 'active', 'pan', 'EZD-017; EZD-207 adds the benchmark project'),
  row('long-tasks-during-pan', 'long-tasks.pan', 'active', 'pan', 'EZD-017'),
  row('long-tasks-during-load', 'long-tasks.load', 'active', 'pan', 'EZD-017'),
  row('frame-times-during-pan', 'frame.desktop', 'active', 'pan', 'EZD-017; EZD-207'),
  row('js-size:editor', 'download.editor', 'active', 'js-size', 'EZD-017; editor route ticket (EZD-120b) repoints'),
  row('js-size:sign-in', 'download.sign-in', 'active', 'js-size', 'EZD-017 (Q-0072 (a))'),
  row('js-size:auth-confirm', 'download.sign-in', 'active', 'js-size', 'EZD-017 (Q-0072 (a))'),
  row('js-size:projects-settings', 'download.projects-settings', 'pending', 'js-size', 'EZD-020'),
  row('js-size:field-pack', 'download.field-pack', 'pending', 'js-size', 'EZD-020'),
  row('js-size:client-link', 'download.client-link', 'pending', 'js-size', 'EZD-020'),
  row('draw-calls-per-frame', 'draw-calls.frame', 'pending', null, 'EZD-207'),
  row('buffers-rebuilt-per-edit', 'buffers-per-edit', 'pending', null, 'EZD-207 / EZD-1001a'),
  row('rows-written-per-save', 'rows-per-save', 'pending', null, 'EZD-120b'),
  row('project-open-ms', 'open.cached', 'pending', null, 'EZD-120b / EZD-236 (adds open.cold)'),
  row('tab-switch-ms', 'tab-switch', 'pending', null, 'EZD-1001a / EZD-1001c (adds tab-first-3d)'),
  row('autosave-ms', 'autosave', 'pending', null, 'EZD-120b'),
  row('tool-pick-ms', 'tool-pick', 'pending', null, 'EZD-230'),
  row('projects-first-cards-ms', 'projects.first-cards', 'pending', null, 'EZD-117b'),
]);
