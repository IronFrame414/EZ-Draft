// Tool rail entry types (vault/plans/EZD-012a.md Step 4; 04 Tool rail).
import type { IconName } from '../icon/icon-names.generated';
import type { MessageKey } from '../../server/messages/catalog';

export type RailTool = {
  kind: 'tool';
  id: string;
  icon: IconName;
  label: MessageKey;
  shortcut?: string;
};

export type RailSeparator = { kind: 'separator' };

export type RailEntry = RailTool | RailSeparator;

// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): the user's order over the tools
// shown. Listed tools come first in the user's order; a tool the list lacks (a tool built later, or never moved)
// keeps its default place after them; an id the list has but the rail does not show is skipped.
export function orderRailTools<T extends { id: string }>(
  tools: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const listed = tools
    .filter((t) => rank.has(t.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...listed, ...tools.filter((t) => !rank.has(t.id))];
}

// The order to store after the rail shows `shown` (the ids in their new order): the shown ids, then the stored ids
// this rail does not show (kept for when they show again, as on a rail with fewer tools in view only).
export function nextRailOrder(shown: readonly string[], stored: readonly string[]): string[] {
  return [...shown, ...stored.filter((id) => !shown.includes(id))];
}

// `ids` with `id` moved to `to` (clamped to the list).
export function moveRailTool(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
