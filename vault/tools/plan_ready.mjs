// The plan checks a v2 plan's ticket must pass before it is set ready (EZD-383, D-Ready): the contract check and the
// connections check, run against HEAD of the checkout. scripts/ledger.mjs loads this module lazily on `status=ready`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { templateVersion, planStep, PLAN_STEPS } from './plan_lint.mjs';
import { readHead } from './contract_check.mjs';
import { checkConnections } from './connections_check.mjs';
import { dependencyProblems } from './dep_check.mjs';

export function readyProblems(root, ticket) {
  if (typeof ticket !== 'string' || !/^EZD-[0-9A-Za-z]+$/.test(ticket)) throw new TypeError(`not a ticket: ${ticket}`);
  let text;
  try { text = readFileSync(path.join(root, 'vault', 'plans', `${ticket}.md`), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const step = planStep(text);
  if (step === 'brief') return ['plan step: brief; the whole plan is not written yet (EZD-384)'];
  // EZD-384b C-Ready: a design plan is refused; a code-bound or legacy v2 plan gets the dependency check.
  if (step === 'design') return ['plan step: design; the code-bound step has not run (EZD-384b)'];
  if (step !== null && !PLAN_STEPS.includes(step)) return [`plan step "${step}" is not brief, design or code-bound (EZD-384b)`];
  if (templateVersion(text) !== 2) return [];
  const head = readHead(root);
  return [
    ...dependencyProblems(root, ticket, head),
    ...checkConnections(text, { root, head }).map((p) => `connections: ${p}`),
  ];
}
