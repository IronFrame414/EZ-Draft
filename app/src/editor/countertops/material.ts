// EZD-416 (S04b Controls "Material swatch row ("Quartz · 3 cm") | Opens catalog picker (category counter)"; board
// S04bCountertops Material; vault/build/assumptions.md EZD-416): picking a countertop item sets it on every top on
// the floor, as one model edit (one undo step). Pure.
import type { CatalogItem } from '../../lib/catalog/catalog';
import type { Change } from '../model/patches';
import { sameId } from '../shared/ids';
import { countertopChange, type CountertopPiece } from './trace-tool';

const same = (a: string | null, b: string) => a !== null && sameId(a, b);

// The changes that link the item to every piece not already on it; [] when none changes.
export function countertopMaterialChanges(pieces: readonly CountertopPiece[], itemId: string): Change[] {
  return pieces
    .filter((p) => !same(p.data.attributes.materialItemId, itemId))
    .map((p) =>
      countertopChange(p.id, { ...p.data, attributes: { ...p.data.attributes, materialItemId: itemId } }),
    );
}

// The chosen item's name; null while the catalog is not read or the item is gone from it.
export function countertopMaterialName(items: readonly CatalogItem[] | null, itemId: string): string | null {
  return items?.find((i) => same(itemId, i.id))?.name ?? null;
}
