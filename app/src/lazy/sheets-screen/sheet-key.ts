// EZD-706 (S13 Data shown "symbol key ("SYMBOLS USED ON THIS SHEET")"; S13 Validation "Key: only symbols and
// abbreviations actually used; updates when objects are added or removed; placement per set"; S13 Decision 8 "On every
// sheet" or "On cover only"; AC-EZD-706-1; vault/build/assumptions.md EZD-706): which key a sheet shows.
// - Every sheet: each plan sheet keys the symbols of the floor it draws (until viewports, EZD-703, narrow what each
//   sheet shows); a sheet with no plan uses no symbols, so it has no key.
// - Cover only: the cover (A0.0) keys the symbols of the whole model, under the set heading; no other sheet has one.
// EZD-708a: the RCP sheet (A6.0) keys only the objects the RCP draws (editor/ceiling/rcp-kinds.ts).
// A key with no symbols is not drawn. The set's placement is the live sheet_set object's when the model holds one.
import {
  parseStoredObject,
  usedSymbols,
  type KeyPlacement,
  type ModelObject,
  type SheetSetKind,
  type SystemSymbol,
} from '@ezdraft/geometry';
import { resolveOpenFloor } from '../../editor/floors/floors';
import type { Objects } from '../../editor/model/patches';
import { sheetShowsPlan } from '../../lib/sheets/sheet-set';
import { isRcpSheet } from '../../lib/sheets/fixture-schedule-table';
import { shownOnRcp } from '../../lib/sheets/rcp-kinds';

export const COVER_SHEET = 'A0.0';

export type SheetKeyScope = 'sheet' | 'set';
export type SheetKey = { scope: SheetKeyScope; symbols: SystemSymbol[] };

// Board S13Sheets "SYMBOL KEY" and "SYMBOLS USED ON THIS SHEET"; the set heading is wording for Josh to confirm.
// Sheet text, English only (S13 Decision 7).
export const SYMBOL_KEY_TITLE = 'SYMBOL KEY';
export function symbolKeyHeading(scope: SheetKeyScope): string {
  return scope === 'sheet' ? 'SYMBOLS USED ON THIS SHEET' : 'SYMBOLS USED IN THIS SET';
}

function parsed(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (r.ok) out.push(r.object);
  }
  return out;
}

// The set's placement: the live sheet_set object of the kind (lowest id) when the model holds one, else `fallback`.
export function livePlacement(objects: readonly ModelObject[], kind: SheetSetKind, fallback: KeyPlacement): KeyPlacement {
  let hit: { id: string; placement: KeyPlacement } | null = null;
  for (const o of objects)
    if (o.type === 'sheet_set' && o.data.kind === kind && (hit === null || o.id < hit.id))
      hit = { id: o.id, placement: o.data.keyPlacement };
  return hit?.placement ?? fallback;
}

export function sheetSymbolKey(
  set: { kind: SheetSetKind; keyPlacement: KeyPlacement },
  sheet: string,
  objects: Objects,
): SheetKey | null {
  const all = parsed(objects);
  const placement = livePlacement(all, set.kind, set.keyPlacement);
  let key: SheetKey;
  if (placement === 'cover_only') {
    if (sheet !== COVER_SHEET) return null;
    key = { scope: 'set', symbols: usedSymbols(all) };
  } else {
    if (!sheetShowsPlan({ number: sheet })) return null;
    const level = resolveOpenFloor(objects, null);
    if (level === null) return null;
    // EZD-708a: the RCP sheet keys only what the RCP draws (no doors, windows or wall devices).
    const drawn = isRcpSheet(sheet) ? all.filter((o) => shownOnRcp(o.type, o.data)) : all;
    key = { scope: 'sheet', symbols: usedSymbols(drawn, level) };
  }
  return key.symbols.length === 0 ? null : key;
}
