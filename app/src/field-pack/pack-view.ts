// EZD-1404 (S17 Controls "Project title / subtitle": "Kitchen remodel · Hendricks"; "Field pack · issued Oct 8";
// Tab bar "Plan, 3D, Measure, Tasks (count of open tasks), Photo"; Tab: Photo "Hidden without Photo notes"): the
// field pack header's text rules.
import type { Language } from '../lib/messages/types';

export type FieldPackTab = 'plan' | '3d' | 'measure' | 'tasks' | 'photo';

// The room chip that shows every room.
export const ALL_ROOMS = 'all';

// Project name, then the client name when there is one.
export function packTitle(projectName: string, clientName: string | null): string {
  return clientName ? `${projectName} · ${clientName}` : projectName;
}

// The tabs in order; Photo only with Photo notes.
export function packTabs(o: { canPhoto: boolean }): FieldPackTab[] {
  const tabs: FieldPackTab[] = ['plan', '3d', 'measure', 'tasks'];
  if (o.canPhoto) tabs.push('photo');
  return tabs;
}

// "Oct 8" in the subtitle; with the year ("Oct 8, 2026") in the revision note. In the phone's time zone.
export function packDate(iso: string, language: Language, withYear: boolean, timeZone?: string): string {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
