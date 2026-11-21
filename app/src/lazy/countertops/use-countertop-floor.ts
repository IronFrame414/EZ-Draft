// EZD-416: the floor the countertop screen, its left panel and its status bar all read, and the pieces on it (moved
// out of the EZD-412 screen so the three agree). The open floor, or (with no floor list) the floor of the first run
// or top.
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { ModelObject } from '@ezdraft/geometry';
import type { ModelStore } from '../../editor/model/model-store';
import type { FloorChoice } from '../../editor/floors/floors';
import { useChosenFloor } from '../../editor/floors/use-chosen-floor';
import { openFloorId } from '../../editor/plan/batches';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import { countertopPieces, type CountertopPiece } from '../../editor/countertops/trace-tool';

export type CountertopFloor = {
  parsed: ModelObject[];
  level: string | null;
  pieces: CountertopPiece[];
};

export function useCountertopFloor(store: ModelStore, floors: FloorChoice | undefined): CountertopFloor {
  const chosen = useChosenFloor(floors);
  const objects = useStore(store, (s) => s.objects);
  const floorId = useMemo(
    () => (floors === undefined ? null : openFloorId(objects, chosen)),
    [objects, chosen, floors],
  );
  const parsed = useMemo(() => modelObjects(objects), [objects]);
  const level = useMemo(() => {
    if (floorId !== null) return floorId;
    const o = parsed.find((x) => x.type === 'cabinet_run' || x.type === 'countertop_piece');
    return o !== undefined && 'level' in o.data ? (o.data.level as string) : null;
  }, [floorId, parsed]);
  const pieces = useMemo(() => countertopPieces(parsed, level), [parsed, level]);
  return { parsed, level, pieces };
}

// The Defaults countertop increment (1/2" while not read, S15d).
export function countertopIncrement(defaults: Readonly<Record<string, unknown>> | null | undefined): number {
  const v = defaults?.['countertop_increment'];
  return typeof v === 'number' && v > 0 ? v : 0.5;
}
