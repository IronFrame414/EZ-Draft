// EZD-1978 (the full check failed at e2e keyboard-shortcuts "Reset shortcut clears a row; Reset to default map fills
// it again": the answer to the first Save landed after Reset to default map and put the form back to the saved
// values, so the edit was lost and Save stayed off). A row edited while a save is on its way keeps the edit.
// Expected values: S15d "Save writes only the edited keys" (Q-0697 03) and the e2e test's own steps: Door reset is
// stored as { door: '' }; Reset to default map after it leaves no changes in the form, which differs from the stored
// map, so the shortcuts row is still an edit to save (null clears the stored map: the e2e test expects
// keyboard_shortcuts to be undefined after that save).
import { describe, expect, it } from 'vitest';
import { checkForm, formAfterSave, formOf } from './DefaultsForm';

describe('EZD-1978 Defaults form after a save comes back', () => {
  it('keeps a row edited while the save was on its way; the edit is still to be saved', () => {
    const sent = { ...formOf({}), keyboard_shortcuts: { door: '' } };
    // While the save is on its way: Reset to default map.
    const current = { ...sent, keyboard_shortcuts: {} };
    const stored = { keyboard_shortcuts: { door: '' } };

    const after = formAfterSave(stored, sent, current);

    expect(after.keyboard_shortcuts).toEqual({});
    const { changes } = checkForm(stored, formOf(stored), after);
    expect(Object.keys(changes)).toEqual(['keyboard_shortcuts']);
  });

  it('with no edit while saving, the form shows the stored values and nothing is left to save', () => {
    const sent = { ...formOf({}), keyboard_shortcuts: { door: '' } };
    const stored = { keyboard_shortcuts: { door: '' } };

    const after = formAfterSave(stored, sent, sent);

    expect(after).toEqual(formOf(stored));
    expect(checkForm(stored, formOf(stored), after).changes).toEqual({});
  });

  it('only the row edited while saving keeps its edit; the saved row shows the stored value', () => {
    const sent = { ...formOf({}), keyboard_shortcuts: { door: '' } };
    const current = { ...sent, share_link_expiry: '45' };
    const stored = { keyboard_shortcuts: { door: '' } };

    const after = formAfterSave(stored, sent, current);

    expect(after.share_link_expiry).toBe('45');
    expect(after.keyboard_shortcuts).toEqual(formOf(stored).keyboard_shortcuts);
  });
});
