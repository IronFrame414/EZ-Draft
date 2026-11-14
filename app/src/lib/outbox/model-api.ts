// EZD-120b Build step 3 (vault/plans/EZD-120b.md section 3 model-api row; Decided "Reopen"; AC-EZD-120b-4, -5):
// the model load answer shared by the browser and the server, the browser's load request and the working copy
// rebuilt from a load and the device outbox. No React, no IndexedDB.
// EZD-294 Build step 7 (vault/plans/EZD-294.md section 3 ModelLoad row; Q-0625 (a)): the load answers each number
// key's highest stored number.
import type { NumberHighs, ObjectIssue } from '@ezdraft/geometry';
import type { OutboxEntry } from './outbox';
import type { PlanScale } from '../plan/plan-scale';
import type { IpadDrawing } from '../profile/profile';

export type ObjectValue = { type: string; schemaVersion: number; data: Record<string, unknown> };

export type LoadedObject = ObjectValue & { id: string; updatedSeq: number };

export type ModelLoad = {
  project: { id: string; name: string; clientName: string | null; planScale: PlanScale };
  // EZD-223: `ipadDrawing` is the viewer's own iPad drawing setting (S15d, Q-0392); missing reads as finger.
  viewer: {
    appUserId: string;
    tenantId: string;
    membershipId: string;
    canEdit: boolean;
    ipadDrawing?: IpadDrawing;
  };
  lockEpoch: number;
  objects: LoadedObject[];
  invalid: ObjectIssue[];
  numberHighs: NumberHighs;
};

export type ModelLoadResult =
  { ok: true; model: ModelLoad } | { ok: false; status: number; code: string };

const NETWORK: ModelLoadResult = { ok: false, status: 0, code: 'network' };

export async function fetchModel(
  projectId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<ModelLoadResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/model`);
    body = await res.json();
  } catch {
    return NETWORK;
  }
  if (res.status === 200) return { ok: true, model: body as ModelLoad };
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return { ok: false, status: res.status, code: typeof code === 'string' ? code : 'network' };
}

// Decided "Reopen": the loaded objects with that project's outbox entries on top (a null value removes).
export function loadWorkingCopy(load: ModelLoad, entries: OutboxEntry[]): Map<string, ObjectValue> {
  const map = new Map<string, ObjectValue>();
  for (const o of load.objects) {
    map.set(o.id, { type: o.type, schemaVersion: o.schemaVersion, data: o.data });
  }
  for (const e of entries) {
    if (e.projectId !== load.project.id) continue;
    if (e.value === null) map.delete(e.id);
    else map.set(e.id, e.value);
  }
  return map;
}
