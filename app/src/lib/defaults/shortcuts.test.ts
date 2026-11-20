// EZD-222 (S15d Keyboard shortcuts table, Reset to default map, Reset shortcut (row); 04 Tool rail "Default key",
// "Shown on"; phase-02.md EZD-222 "Already used by check, browser keys refused"; AC-EZD-222-1). Expected keys come
// from the 04 table and the S15d default map.
import { describe, expect, it } from 'vitest';
import { checkValue, formValueOf, parseFormValue } from './values';
import { defaultRow } from './registry';
import {
  DEFAULT_BINDINGS,
  checkOverrides,
  commandForKey,
  effectiveBindings,
  keyLabel,
  keyOfEvent,
  overridesOf,
  refuseKey,
  resetToDefaultMap,
  sharedView,
  usedBy,
} from './shortcuts';

const ev = (key: string, mods: Partial<{ shift: boolean; ctrl: boolean; meta: boolean; alt: boolean }> = {}) => ({
  key,
  shiftKey: mods.shift ?? false,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  altKey: mods.alt ?? false,
});

describe('EZD-222 default key map', () => {
  it('has the 04 / S15d default keys for the built commands', () => {
    expect(DEFAULT_BINDINGS).toEqual({
      select: 'V',
      move: 'M',
      wall: 'W',
      'room-rect': 'R',
      door: 'D',
      window: 'N',
      cabinets: 'C',
      countertops: 'K',
      fixtures: 'F',
      electrical: 'E',
      sketch: 'S',
      measure: 'Shift+L',
      help: '?',
      undo: 'Mod+Z',
      redo: 'Mod+Shift+Z',
      copy: 'Mod+C',
      paste: 'Mod+V',
    });
    expect(checkOverrides({})).toBeNull();
  });

  it('reads key events as key text', () => {
    expect(keyOfEvent(ev('w'))).toBe('W');
    expect(keyOfEvent(ev('L', { shift: true }))).toBe('Shift+L');
    // US layout: ? is Shift+/ and arrives as key '?'.
    expect(keyOfEvent(ev('?', { shift: true }))).toBe('?');
    expect(keyOfEvent(ev('z', { ctrl: true, shift: true }))).toBe('Mod+Shift+Z');
    expect(keyOfEvent(ev('z', { meta: true }))).toBe('Mod+Z');
    expect(keyOfEvent(ev('Shift', { shift: true }))).toBeNull();
    expect(keyOfEvent(ev('w', { alt: true }))).toBeNull();
    expect(keyOfEvent(ev(' '))).toBeNull();
    expect(keyOfEvent(ev('Enter'))).toBeNull();
    // Board S15dDefaults: "Ctrl+Shift+Z" (Ctrl means Cmd on Mac).
    expect(keyLabel('Mod+Shift+Z')).toBe('Ctrl+Shift+Z');
  });
});

describe('EZD-222 AC-EZD-222-1 rebinding Wall', () => {
  it('a stored change moves Wall to its new key; W no longer turns it on', () => {
    const b = effectiveBindings({ wall: 'B' });
    expect(b.wall).toBe('B');
    expect(commandForKey(b, ev('b'))).toBe('wall');
    expect(commandForKey(b, ev('w'))).toBeNull();
    expect(commandForKey(DEFAULT_BINDINGS, ev('w'))).toBe('wall');
    expect(commandForKey(DEFAULT_BINDINGS, ev('l', { shift: true }))).toBe('measure');
    expect(commandForKey(DEFAULT_BINDINGS, ev('l'))).toBeNull();
    // A shifted letter no command has runs the plain letter's command.
    expect(commandForKey(b, ev('B', { shift: true }))).toBe('wall');
    expect(commandForKey(DEFAULT_BINDINGS, ev('R', { shift: true }))).toBe('room-rect');
    // 04 Other default keys: Undo, Redo, Copy, Paste with Ctrl or Cmd.
    expect(commandForKey(DEFAULT_BINDINGS, ev('z', { ctrl: true }))).toBe('undo');
    expect(commandForKey(DEFAULT_BINDINGS, ev('Z', { meta: true, shift: true }))).toBe('redo');
    expect(commandForKey(DEFAULT_BINDINGS, ev('c', { meta: true }))).toBe('copy');
    expect(commandForKey(DEFAULT_BINDINGS, ev('v', { ctrl: true }))).toBe('paste');
    expect(commandForKey(DEFAULT_BINDINGS, ev('v'))).toBe('select');
  });

  it('a stored value that fails the check reads as the default map', () => {
    expect(effectiveBindings({ wall: 'R' })).toEqual(DEFAULT_BINDINGS);
    expect(effectiveBindings('nope')).toEqual(DEFAULT_BINDINGS);
  });
});

describe('EZD-222 Already used by, browser keys', () => {
  it('a key another command uses in the same view is refused and names it', () => {
    expect(usedBy(DEFAULT_BINDINGS, 'wall', 'R')?.id).toBe('room-rect');
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'R')).toBe('used');
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'B')).toBeNull();
    // Its own key is not a clash.
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'W')).toBeNull();
    expect(checkOverrides({ wall: 'R' })).toBe('used');
    // Board S15dDefaults "Already used by Wall in Plan": the first view both are shown on.
    expect(sharedView('wall', 'room-rect')).toBe('plan');
    expect(sharedView('sketch', 'select')).toBe('plan');
  });

  it('browser keys are refused', () => {
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'Mod+W')).toBe('browser');
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'Mod+T')).toBe('browser');
    expect(refuseKey(DEFAULT_BINDINGS, 'wall', 'Mod+R')).toBe('browser');
    expect(checkOverrides({ wall: 'Mod+N' })).toBe('browser');
  });

  it('unknown commands and bad key text are refused', () => {
    expect(checkOverrides({ nope: 'B' })).toBe('invalid');
    expect(checkOverrides({ wall: 'b' })).toBe('invalid');
    expect(checkOverrides({ wall: 'Shift+?' })).toBe('invalid');
    expect(checkOverrides({ wall: 3 })).toBe('invalid');
    expect(checkOverrides([])).toBe('invalid');
  });
});

describe('EZD-222 Reset shortcut and Reset to default map', () => {
  it('Reset shortcut clears the row; a cleared row is stored as ""', () => {
    const cleared = { ...DEFAULT_BINDINGS, wall: '' };
    expect(overridesOf(cleared)).toEqual({ wall: '' });
    expect(effectiveBindings({ wall: '' }).wall).toBe('');
    expect(commandForKey(effectiveBindings({ wall: '' }), ev('w'))).toBeNull();
  });

  it('Reset to default map fills empty rows and never overwrites a key already set', () => {
    const b = { ...DEFAULT_BINDINGS, wall: '', door: 'B', move: '' };
    const r = resetToDefaultMap(b);
    expect(r.wall).toBe('W');
    expect(r.move).toBe('M');
    expect(r.door).toBe('B');
    expect(overridesOf(r)).toEqual({ door: 'B' });
  });

  it('a default key another command now uses leaves that row empty', () => {
    const b = { ...DEFAULT_BINDINGS, wall: '', door: 'W' };
    const r = resetToDefaultMap(b);
    expect(r.wall).toBe('');
    expect(r.door).toBe('W');
  });
});

describe('EZD-222 the Defaults row', () => {
  const row = defaultRow('keyboard_shortcuts');
  it('is stored as the changes only; no changes removes the key', () => {
    expect(row?.type).toBe('shortcuts');
    if (!row) return;
    expect(checkValue(row, { wall: 'B' }).ok).toBe(true);
    expect(checkValue(row, { wall: 'R' }).ok).toBe(false);
    expect(formValueOf(row, { wall: 'B' })).toEqual({ wall: 'B' });
    expect(parseFormValue(row, {})).toEqual({ ok: true, value: null });
    expect(parseFormValue(row, { wall: 'B' })).toEqual({ ok: true, value: { wall: 'B' } });
  });
});
