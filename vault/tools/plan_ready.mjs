// The plan checks a v2 plan's ticket must pass before it is set ready (EZD-383, D-Ready): the contract check and the
// connections check, run against HEAD of the checkout. scripts/ledger.mjs loads this module lazily on `status=ready`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { templateVersion } from './plan_lint.mjs';
import { readHead, checkContract } from './contract_check.mjs';
import { checkConnections } from './connections_check.mjs';

export function readyProblems(root, ticket) {
  if (typeof ticket !== 'string' || !/^EZD-[0-9A-Za-z]+$/.test(ticket)) throw new TypeError(`not a ticket: ${ticket}`);
  let text;
  try { text = readFileSync(path.join(root, 'vault', 'plans', `${ticket}.md`), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  if (templateVersion(text) !== 2) return [];
  const head = readHead(root);
  return [
    ...checkContract(text, { root, head }).map((p) => `contract: ${p}`),
    ...checkConnections(text, { root, head }).map((p) => `connections: ${p}`),
  ];
}
