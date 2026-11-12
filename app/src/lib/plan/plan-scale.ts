// EZD-219 Build step 3 (vault/plans/EZD-219.md section 3; Q-0664 "Plan display scale"; Decided "Scale list",
// "Reading `plan_scale`"): the seven plan scales (plan inches per foot), the project setting read and its save.
// Browser and server.

export const PLAN_SCALES = [0.125, 0.1875, 0.25, 0.375, 0.5, 0.75, 1] as const;

export type PlanScale = (typeof PLAN_SCALES)[number];

export const DEFAULT_PLAN_SCALE: PlanScale = 0.5;

export function isPlanScale(v: unknown): v is PlanScale {
  return typeof v === 'number' && (PLAN_SCALES as readonly number[]).includes(v);
}

// Decided "Reading `plan_scale`": anything but an object holding a valid plan_scale reads as the default.
export function planScaleFromSettings(settings: unknown): PlanScale {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_PLAN_SCALE;
  }
  const v = (settings as { plan_scale?: unknown }).plan_scale;
  return isPlanScale(v) ? v : DEFAULT_PLAN_SCALE;
}

// Section 3: true only on 200; any other status or a thrown fetch is false.
export async function savePlanScale(
  projectId: string,
  scale: PlanScale,
  opts?: { fetchImpl?: typeof fetch },
): Promise<boolean> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/plan-scale`, {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scale }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
