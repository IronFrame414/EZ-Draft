// EZD-120c U8 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-3 to -9). Expected values: plan section 6 (sourced:
// working_copy from the board; saving, saved_just_now, saved_min_ago, save_failed from S03; saved from Q-0505;
// offline from Q-0214 and Q-0501; the rest proposed). Eleven keys in English, none in Spanish.
import { describe, expect, it } from 'vitest';
import { en } from '../server/messages/catalogs/en';
import { es } from '../server/messages/catalogs/es';

const keysOf = (catalog: object) =>
  Object.keys(catalog)
    .filter((k) => k.startsWith('office.editor.'))
    .sort();

describe('EZD-120c editor messages', () => {
  it('U8 keys: office.editor.* is section 6 in English and absent in Spanish', () => {
    const E = en as unknown as Record<string, unknown>;
    const expected: Record<string, string> = {
      'office.editor.working_copy': 'Working copy',
      'office.editor.saving': 'Saving…',
      'office.editor.saved': 'Saved',
      'office.editor.saved_just_now': 'Saved just now',
      'office.editor.saved_min_ago': 'Saved {minutes} min ago',
      'office.editor.saved_at': 'Saved at {time}',
      'office.editor.saved_on_device': 'Saved on this device',
      'office.editor.not_saved': 'Not saved',
      'office.editor.save_failed': 'Changes not saved',
      'office.editor.load_failed': "Couldn't load this project.",
      'office.editor.offline': 'Offline. Changes are saved on this device and will sync.',
    };
    expect(keysOf(en)).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expect(E[key], key).toBe(value);
    expect(keysOf(es)).toEqual([]);
  });
});
