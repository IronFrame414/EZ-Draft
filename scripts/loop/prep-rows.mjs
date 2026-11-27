// EZD-2023 (audit 2026-11-27 X3): the "## Settled" rows of a ticket's prep file, vault/build/assumptions/<T>.md, hold
// the scope its acceptance criteria leave out. The builder and the reviewer prompts make them binding input alongside the
// ACs, the spec files and the decisions.
import { ownAssumptions } from './lanes.mjs';

export function prepRowsLine(id, role = 'builder') {
  const file = ownAssumptions(id);
  if (role === 'reviewer') {
    return `Settled rows: the "## Settled" rows of ${id} in ${file} (its prep file, if it exists) are binding input alongside the acceptance criteria, spec files and decisions. Check the change against them too; a Settled row the change does not follow is a blocking finding, like an unmet acceptance criterion.`;
  }
  return `Settled rows: read ${file} (the ticket's prep file) if it exists. Its "## Settled" rows for ${id} are binding input alongside the acceptance criteria, spec files and decisions: build what they settle, as they settle it.`;
}
