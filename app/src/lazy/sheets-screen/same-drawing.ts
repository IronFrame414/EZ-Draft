// EZD-1975 (AC-EZD-1975-1; 11 rule 2 "Recompute only what changed"): whether two models draw the same sheet. A save's
// answer puts the server's wall, door and window numbers in the open model (model-store applySavedNumbers), which
// makes a new objects map though nothing the sheet draws has changed: the sheet's drawing list reads no object
// number. Such an answer can land well after the edit it belongs to (after a return to Sheets on a slow machine), so
// it must not draw the sheet again. If a sheet ever prints these numbers, this comparison must count them.
import { numberKeyOf } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Objects } from '../../editor/model/patches';

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

// The same own fields with identical values, leaving `skip` out; `differs` may accept a field that is not identical.
function sameFields(a: Rec, b: Rec, skip: string | null, differs: (key: string) => boolean): boolean {
  const keys = Object.keys(a).filter((k) => k !== skip);
  if (keys.length !== Object.keys(b).filter((k) => k !== skip).length) return false;
  for (const k of keys) {
    if (!Object.hasOwn(b, k)) return false;
    if (a[k] !== b[k] && !differs(k)) return false;
  }
  return true;
}

// The same object but for its number (data.attributes.number), as withObjectNumber makes it.
function sameButNumber(a: ObjectValue, b: ObjectValue): boolean {
  if (a.type !== b.type || a.schemaVersion !== b.schemaVersion) return false;
  if (numberKeyOf(a) === null || numberKeyOf(b) === null) return false;
  const da: unknown = a.data;
  const db: unknown = b.data;
  if (!isRec(da) || !isRec(db)) return false;
  return sameFields(da, db, null, (k) => {
    const x = da[k];
    const y = db[k];
    return k === 'attributes' && isRec(x) && isRec(y) && sameFields(x, y, 'number', () => false);
  });
}

export function sameDrawing(a: Objects, b: Objects): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, v] of a) {
    const w = b.get(id);
    if (w === undefined) return false;
    if (w !== v && !sameButNumber(v, w)) return false;
  }
  return true;
}
