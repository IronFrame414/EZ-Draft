// EZD-1401 (S17 Offline status icon: Green "offline_pin" = pack cached; spinner while caching; amber with count =
// offline with n queued actions; 11 Offline "Status shows queued change count"): which look the header's offline
// icon has. "Cached" is the open project's data and its page both on this device. Nothing shows before the first
// store starts, after a store failed, or offline with nothing stored.
import type { ModelCopy } from './project-cache';

export type OfflineIcon = { kind: 'cached' } | { kind: 'caching' } | { kind: 'queued'; count: number };

export function offlineIcon(s: {
  online: boolean;
  model: ModelCopy;
  page: boolean;
  queued: number;
}): OfflineIcon | null {
  if (!s.online && s.queued > 0) return { kind: 'queued', count: s.queued };
  if (s.model === 'stored' && s.page) return { kind: 'cached' };
  if (s.online && (s.model === 'storing' || s.model === 'stored')) return { kind: 'caching' };
  return null;
}
