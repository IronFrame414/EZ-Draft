// EZD-299 U6 (vault/plans/EZD-299.md section 4 and 6; AC-EZD-299-10). Expected values: plan section 6 (approved on
// board S03b, wording file S03bConflictList-wording.md). Office English only: no key in Spanish. The object labels
// (`office.conflicts.object.*`) belong to EZD-299a and are not part of this check.
import { describe, expect, it } from 'vitest';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';

const keysOf = (catalog: object, prefix: string) =>
  Object.keys(catalog)
    .filter((k) => k.startsWith(prefix) && !k.startsWith('office.conflicts.object.'))
    .sort();

describe('EZD-299 conflict messages', () => {
  it('U6 keys: office.conflicts.* is section 6 in English and absent in Spanish', () => {
    const E = en as unknown as Record<string, unknown>;
    const expected: Record<string, unknown> = {
      'office.conflicts.banner.title': {
        one: "Couldn't save {count} change to {project}.",
        other: "Couldn't save {count} changes to {project}.",
      },
      'office.conflicts.banner.others_saved': 'Your other edits are saved.',
      'office.conflicts.banner.review': 'Review changes',
      'office.conflicts.title': 'Changes not saved',
      'office.conflicts.account_note':
        "This list is kept with your account, so it's the same on every device.",
      'office.conflicts.group.this': 'This project',
      'office.conflicts.group.other': 'Other projects',
      'office.conflicts.group.not_open': 'Projects you can no longer open',
      'office.conflicts.yours': 'Yours',
      'office.conflicts.saved': 'Saved',
      'office.conflicts.deleted': 'Deleted',
      'office.conflicts.why.they_deleted': 'Someone else deleted this {noun} after you changed it.',
      'office.conflicts.hint.brings_back': 'Keep mine brings it back.',
      'office.conflicts.why.you_deleted':
        'You deleted this {noun}, but someone else had changed it.',
      'office.conflicts.hint.deletes_theirs': 'Keep mine deletes their version.',
      'office.conflicts.why.invalid':
        "EZ Draft built this change wrong, so it can't be saved. We've reported the problem.",
      'office.conflicts.why.outdated':
        'This change was made in an older version of EZ Draft. Reload to send it again.',
      'office.conflicts.why.not_open':
        "You no longer have access to this project, so this change can't be saved.",
      'office.conflicts.why.not_editable':
        "You can no longer edit this project's model, so this change can't be saved.",
      'office.conflicts.footer':
        'Keep mine saves your change over the saved one. Keep theirs drops your change.',
      'office.conflicts.action.show': 'Show',
      'office.conflicts.action.keep_mine': 'Keep mine',
      'office.conflicts.action.keep_theirs': 'Keep theirs',
      'office.conflicts.action.remove': 'Remove',
      'office.conflicts.action.reload': 'Reload',
      'office.conflicts.noun.door': 'door',
      'office.conflicts.noun.window': 'window',
      'office.conflicts.noun.wall': 'wall',
      'office.conflicts.noun.room': 'room',
      'office.conflicts.noun.floor': 'floor',
      'office.conflicts.noun.object': 'object',
      'office.conflicts.field.length': 'Length',
      'office.conflicts.field.thickness': 'Thickness',
      'office.conflicts.field.height': 'Height',
      'office.conflicts.field.width': 'Width',
      'office.conflicts.field.sill_height': 'Sill height',
      'office.conflicts.field.position': 'Position',
      'office.conflicts.field.details': 'Details',
      'office.conflicts.empty': 'Every change is saved.',
      'office.conflicts.load_failed': "Couldn't load the saved list.",
      'office.conflicts.show_more': 'Show more',
      'office.conflicts.saved_by': '{name} · {time}',
    };
    expect(keysOf(en, 'office.conflicts.')).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expect(E[key], key).toEqual(value);
    expect(keysOf(es, 'office.conflicts.')).toEqual([]);
    expect(Object.keys(es).filter((k) => k.startsWith('office.conflicts.'))).toEqual([]);
  });
});
