// EZD-214 (S03 Controls — status bar "View"; S03 Decisions; 03 Q-0664 "View default"; 05 Q-0667; 09m Phase
// switch): the phase view rules shared by the browser and the server. A view is Existing or Proposed; the Phase
// eyes start from the view's defaults and decide which statuses the canvas shows. No React, no DOM.
import type { ObjectStatus } from '@ezdraft/geometry';

export const PHASE_VIEWS = ['existing', 'proposed'] as const;

export type PhaseView = (typeof PHASE_VIEWS)[number];

export const DEFAULT_PHASE_VIEW: PhaseView = 'existing';

export type PhaseEyes = Readonly<Record<ObjectStatus, boolean>>;

export function isPhaseView(v: unknown): v is PhaseView {
  return v === 'existing' || v === 'proposed';
}

// 03 Q-0664: anything but a stored existing or proposed reads as Existing.
export function phaseViewOf(v: unknown): PhaseView {
  return isPhaseView(v) ? v : DEFAULT_PHASE_VIEW;
}

// Q-0667: Existing view shows Existing and Demo, hides New; Proposed shows Existing and New, hides Demo.
export function eyeDefaults(view: PhaseView): PhaseEyes {
  return view === 'existing'
    ? Object.freeze({ existing: true, demo: true, new: false })
    : Object.freeze({ existing: true, demo: false, new: true });
}

// S03 Status bar "View": Existing draws new objects as existing; Proposed: new objects default to New.
export function newObjectStatus(view: PhaseView): ObjectStatus {
  return view === 'existing' ? 'existing' : 'new';
}

// What the canvas, hover, pick and snap read: `version` changes with every display change, so an index made for
// one version is rebuilt in full for the next; `shown` is the test for one stored object's status.
export type PhaseFilter = {
  version(): number;
  shown(status: unknown): boolean;
};

// The editor's live phase: the filter, its change listeners, and the status a new object takes.
export type PhaseSource = PhaseFilter & {
  subscribe(listener: () => void): () => void;
  newObjectStatus(): ObjectStatus;
};

// Shown with no filter: every status.
export function shownBy(filter: PhaseFilter | null | undefined, status: unknown): boolean {
  return filter === null || filter === undefined || filter.shown(status);
}

// The canvas test for one stored object: an object with a status is shown when its eye is on; an object without
// one (a floor, a group) is always shown.
export function statusShown(eyes: PhaseEyes, status: unknown): boolean {
  if (status === 'existing' || status === 'demo' || status === 'new') return eyes[status];
  return true;
}

// Browser: true only on 200; any other status or a thrown fetch is false.
export async function savePhaseView(
  projectId: string,
  phase: PhaseView,
  opts?: { fetchImpl?: typeof fetch },
): Promise<boolean> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/phase-default`, {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
