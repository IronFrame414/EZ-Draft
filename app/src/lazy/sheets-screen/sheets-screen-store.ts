// EZD-702a (S13 Layout, Controls; AC-EZD-702a-1): the Sheets screen's state, shared by its left panel, canvas and
// status bar items. It holds the project's two sets (GET /api/projects/[id]/sheet-sets, EZD-726), the chosen set and
// the open sheet, and the sheet preview's fit zoom. Opening a sheet from the list, the strip or Previous / Next all go
// through open().
import type { SheetSetKind } from '@ezdraft/geometry';
import type { SheetSetSummary } from '../../lib/sheets/sheet-set';

export type SheetsScreenState = {
  load: 'loading' | 'ready' | 'failed';
  sets: SheetSetSummary[];
  kind: SheetSetKind;
  // The open sheet's number; null while the chosen set has no sheets.
  open: string | null;
  // The preview's zoom (shown size over printed size), null until the preview is measured.
  zoom: number | null;
};

export type SheetsScreen = {
  get(): SheetsScreenState;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  chooseSet(kind: SheetSetKind): void;
  open(number: string): void;
  setZoom(zoom: number | null): void;
  set(): SheetSetSummary | null;
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createSheetsScreen(projectId: string, fetchFn: Fetch = fetch): SheetsScreen {
  let state: SheetsScreenState = { load: 'loading', sets: [], kind: 'permit', open: null, zoom: null };
  const listeners = new Set<() => void>();
  const update = (next: Partial<SheetsScreenState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };
  const setOf = (kind: SheetSetKind) => state.sets.find((s) => s.kind === kind) ?? null;
  const firstOf = (kind: SheetSetKind) => setOf(kind)?.sheets[0]?.number ?? null;

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      update({ load: 'loading' });
      try {
        const res = await fetchFn(`/api/projects/${projectId}/sheet-sets`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { sets: SheetSetSummary[] };
        state = { ...state, sets: body.sets };
        const keep = setOf(state.kind)?.sheets.some((s) => s.number === state.open);
        update({ load: 'ready', open: keep ? state.open : firstOf(state.kind) });
      } catch {
        update({ load: 'failed' });
      }
    },
    chooseSet(kind) {
      if (kind === state.kind) return;
      update({ kind, open: firstOf(kind) });
    },
    open(number) {
      if (number === state.open) return;
      if (!setOf(state.kind)?.sheets.some((s) => s.number === number)) return;
      update({ open: number });
    },
    setZoom(zoom) {
      if (zoom !== state.zoom) update({ zoom });
    },
    set: () => setOf(state.kind),
  };
}
