// EZD-1009 (03b rule 4; S07 Option card; AC-EZD-1009-2; vault/build/assumptions.md EZD-1009 "Patch form"): an
// option's patches are applied over the working model in memory, for display only. The working model passed in is
// never changed: the answer is a new list, and objects no patch touches are the same objects; a patched object is
// a fresh parse, so it shares nothing with the stored patch. A replace or remove whose id is not in the working
// model, or an add whose id already is, is flagged and skipped (the option card shows the flag). A patch never
// reaches a design option object.
import {
  parseStoredObject,
  CURRENT_SCHEMA_VERSION,
  type DesignOptionData,
  type DesignOptionPatch,
  type ModelObject,
} from '../schema';

export type SkippedPatch = { index: number; op: DesignOptionPatch['op']; id: string };
export type AppliedOption = { objects: ModelObject[]; skipped: SkippedPatch[] };

export function applyDesignOption(
  working: readonly ModelObject[],
  option: Pick<DesignOptionData, 'modelDelta'>,
): AppliedOption {
  const objects = [...working];
  const at = new Map<string, number>();
  objects.forEach((o, i) => at.set(o.id.toLowerCase(), i));
  const removed = new Set<number>();
  const skipped: SkippedPatch[] = [];

  option.modelDelta.forEach((patch, index) => {
    const id = patch.op === 'remove' ? patch.id : patch.object.id;
    const key = id.toLowerCase();
    const i = at.get(key);
    const skip = () => skipped.push({ index, op: patch.op, id });
    if (patch.op === 'add') {
      if (i !== undefined) return skip();
      const parsed = parsePatchObject(patch.object);
      if (parsed === null) return skip();
      at.set(key, objects.length);
      objects.push(parsed);
      return;
    }
    if (i === undefined || removed.has(i) || objects[i]!.type === 'design_option') return skip();
    if (patch.op === 'remove') {
      removed.add(i);
      return;
    }
    const parsed = parsePatchObject(patch.object);
    if (parsed === null) return skip();
    objects[i] = parsed;
  });

  return { objects: objects.filter((_, i) => !removed.has(i)), skipped };
}

function parsePatchObject(
  object: Extract<DesignOptionPatch, { op: 'add' | 'replace' }>['object'],
): ModelObject | null {
  if (object.type === 'design_option') return null;
  const parsed = parseStoredObject({
    id: object.id,
    type: object.type,
    schema_version: CURRENT_SCHEMA_VERSION,
    data: object.data,
  });
  return parsed.ok ? parsed.object : null;
}
