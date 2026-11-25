// EZD-412 (S04b Controls "Trace cabinets | Canvas tool bar | Creates tops automatically from cabinet runs with default
// overhangs | Disabled when no cabinets", "Click piece | Canvas | Selects piece"; W5 step 1; AC-EZD-412-1;
// vault/build/assumptions.md EZD-412): what the countertop screen reads from the model, and Trace cabinets as model
// changes. Pure: no React, no DOM. Countertop pieces are model objects (Architecture rule 3), so a trace is one
// `applyEdit` (one undo step).
import {
  CURRENT_SCHEMA_VERSION,
  canTraceCountertops,
  pointInRing,
  traceCountertops,
  type CountertopPieceData,
  type CountertopTraceDefaults,
  type ModelObject,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import { sameId } from '../shared/ids';

export type CountertopPiece = Extract<ModelObject, { type: 'countertop_piece' }>;

const onLevel = (level: string | null, l: string) => level === null || sameId(l, level);

// The pieces on the open floor, in model order (`level` null reads every floor).
export function countertopPieces(
  objects: readonly ModelObject[],
  level: string | null,
): CountertopPiece[] {
  return objects.filter(
    (o): o is CountertopPiece => o.type === 'countertop_piece' && onLevel(level, o.data.level),
  );
}

// The piece under a point: the last one drawn (on top) wins; null off every piece.
export function countertopPieceAt(
  pieces: readonly CountertopPiece[],
  p: { x: number; y: number },
): string | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (pointInRing(p, pieces[i]!.data.geometry.outline)) return pieces[i]!.id;
  }
  return null;
}

// The Defaults → Countertops overhangs Trace uses (per project; S15d "Default overhang: Standard 1 1/2"", "Against
// wall 0 + splash"), from the effective defaults; the registry defaults while a value is not read.
export function countertopTraceDefaults(
  values: Readonly<Record<string, unknown>> | null,
): CountertopTraceDefaults {
  const num = (k: string, d: number) => {
    const v = values?.[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d;
  };
  return { standard: num('overhang_standard', 1.5), againstWall: num('overhang_against_wall', 0) };
}

export const countertopChange = (id: string, data: CountertopPieceData): Change => ({
  id,
  value: {
    type: 'countertop_piece',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as unknown as Record<string, unknown>,
  },
});

export const canTraceCabinets = (objects: readonly ModelObject[], level: string | null): boolean =>
  level !== null && canTraceCountertops(objects, level);

// Trace cabinets: one new piece per counter stretch not yet under a top; `ids` are the new pieces in label order.
export function countertopTraceChanges(
  objects: readonly ModelObject[],
  level: string | null,
  defaults: CountertopTraceDefaults,
  newId: () => string,
): { changes: Change[]; ids: string[] } {
  if (level === null) return { changes: [], ids: [] };
  const changes: Change[] = [];
  const ids: string[] = [];
  for (const data of traceCountertops(objects, level, defaults)) {
    const id = newId();
    ids.push(id);
    changes.push(countertopChange(id, data));
  }
  return { changes, ids };
}
