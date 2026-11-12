// EZD-120d Build step 17 (vault/plans/EZD-120d.md section 3 save-bench row; Decided "Bench walls", "50 edits",
// "Fault", "waitForSync"; Q-0505; P202 dev data): the pure parts of the save test page. No React.
import { CURRENT_SCHEMA_VERSION, DEFAULT_WALL_LAYERS } from '@ezdraft/geometry';
import type { Change, Objects } from '../../../../../editor/model/patches';
import type { ConflictList, ConflictListState } from '../../../../../lib/conflicts/conflict-list';
import type { ObjectValue } from '../../../../../lib/outbox/model-api';
import type { OutboxSync, SyncState } from '../../../../../lib/outbox/outbox-sync';

const TARGETS = 5;
const WALLS = 10;
const OBJECTS_PATH = /^\/api\/projects\/[^/]+\/objects$/;

// Ten walls on the floor, each 120" long and 48" below the one before.
export function benchWalls(floorId: string): Change[] {
  const walls: Change[] = [];
  for (let k = 1; k <= WALLS; k++) {
    const y = 48 * (k - 1);
    walls.push({
      id: crypto.randomUUID(),
      value: {
        type: 'wall',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { start: { x: 0, y }, end: { x: 120, y } },
          status: 'new',
          level: floorId,
          attributes: {
            thickness: 4.5,
            thicknessSide: 'center',
            height: 96,
            topCutToCeiling: false,
            bearing: false,
            layers: DEFAULT_WALL_LAYERS.map((layer) => ({ ...layer })),
          },
        },
      },
    });
  }
  return walls;
}

// The walls by id, the first five.
export function benchTargets(objects: Objects): string[] {
  return [...objects]
    .filter(([, value]) => value.type === 'wall')
    .map(([id]) => id)
    .sort()
    .slice(0, TARGETS);
}

const withHeight = (value: ObjectValue, height: number): ObjectValue => {
  const data = value.data as { attributes: Record<string, unknown> };
  return { ...value, data: { ...value.data, attributes: { ...data.attributes, height } } };
};

// Edit i (1 to 50) sets the height of target ((i - 1) mod 5) + 1 to 96 + i; each edit starts from the value the
// earlier edits left.
export function fiftyEdits(objects: Objects, targets: string[]): Change[][] {
  const current = new Map<string, ObjectValue>();
  for (const id of targets) {
    const value = objects.get(id);
    if (value !== undefined) current.set(id, value);
  }
  const edits: Change[][] = [];
  for (let i = 1; i <= 50; i++) {
    const id = targets[(i - 1) % TARGETS];
    const next = withHeight(current.get(id) as ObjectValue, 96 + i);
    current.set(id, next);
    edits.push([{ id, value: next }]);
  }
  return edits;
}

// Rows that are new or have a different sequence number.
export function countWritten(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): number {
  let n = 0;
  for (const [id, seq] of after) if (before.get(id) !== seq) n++;
  return n;
}

export type SaveFault = {
  fetchImpl: typeof fetch;
  arm(): void;
  disarm(): void;
  armed(): boolean;
};

// Armed: a POST to the objects route fails with 500 and never reaches the network.
export function createSaveFault(base: typeof fetch): SaveFault {
  let on = false;
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const path = new URL(url, 'http://localhost').pathname;
    if (on && method === 'POST' && OBJECTS_PATH.test(path)) {
      return Promise.resolve(
        Response.json(
          { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
          { status: 500 },
        ),
      );
    }
    return base(input, init);
  }) as typeof fetch;
  return {
    fetchImpl,
    arm: () => {
      on = true;
    },
    disarm: () => {
      on = false;
    },
    armed: () => on,
  };
}

// The first state that is saved at or after `after`, or an error; else the state when `timeoutMs` has passed.
export function waitForSync(
  sync: OutboxSync,
  after: number,
  timeoutMs: number,
): Promise<SyncState> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const finish = (state: SyncState) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve(state);
    };
    const done = (s: SyncState) =>
      s.status === 'error' || (s.status === 'saved' && (s.lastSavedAt ?? 0) >= after);
    const timer = setTimeout(() => finish(sync.getState()), timeoutMs);
    if (done(sync.getState())) {
      finish(sync.getState());
      return;
    }
    unsubscribe = sync.subscribe((s) => {
      if (done(s)) finish(s);
    });
  });
}

// EZD-299 Build step 12 (vault/plans/EZD-299.md section 3 C10; Decided D-Fault; Q-0508; 03b rule 9): armed, the next
// save to the objects route first sends "their" version of the same changes (each wall's height + 1) with the
// same headers, so the save that follows carries a stale base and is refused. One shot.
type WireChange = {
  deleted?: unknown;
  type?: unknown;
  data?: { attributes?: { height?: unknown } };
};

const theirs = (change: WireChange): WireChange => {
  const height = change.data?.attributes?.height;
  if (change.deleted !== false || change.type !== 'wall' || typeof height !== 'number')
    return change;
  return {
    ...change,
    data: { ...change.data, attributes: { ...change.data?.attributes, height: height + 1 } },
  };
};

const theirBody = (body: unknown): string | null => {
  if (typeof body !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const { lockEpoch, changes } = (parsed ?? {}) as { lockEpoch?: unknown; changes?: unknown };
  if (!Array.isArray(changes)) return null;
  return JSON.stringify({ lockEpoch, changes: (changes as WireChange[]).map(theirs) });
};

export function createConflictFault(base: typeof fetch): SaveFault {
  let on = false;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const path = new URL(url, 'http://localhost').pathname;
    if (!on || method !== 'POST' || !OBJECTS_PATH.test(path)) return base(input, init);
    on = false;
    const body = theirBody(init?.body);
    if (body === null) return base(input, init);
    const answer = await base(input, { ...init, body });
    if (answer.status !== 200) return answer;
    return base(input, init);
  }) as typeof fetch;
  return {
    fetchImpl,
    arm: () => {
      on = true;
    },
    disarm: () => {
      on = false;
    },
    armed: () => on,
  };
}

// EZD-299 Decided D-Wait: true at the first state (now or later) whose rows hold `key` (lower-case compare), false
// after `timeoutMs`; unsubscribes and clears its timer either way.
export function waitForConflict(
  list: Pick<ConflictList, 'getState' | 'subscribe'>,
  key: string,
  timeoutMs: number,
): Promise<boolean> {
  const want = key.toLowerCase();
  const has = (s: ConflictListState) => s.rows.some((r) => r.key.toLowerCase() === want);
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const finish = (found: boolean) => {
      clearTimeout(timer);
      unsubscribe?.();
      unsubscribe = null;
      resolve(found);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    if (has(list.getState())) {
      finish(true);
      return;
    }
    unsubscribe = list.subscribe((s) => {
      if (has(s)) finish(true);
    });
  });
}
