// EZD-222 (S15d Keyboard shortcuts table, Reset to default map, Reset shortcut (row); 04 Tool rail "Default key",
// "Shown on"; phase-02.md EZD-222 "Already used by check, browser keys refused"; AC-EZD-222-1). Expected keys come
// from the 04 table and the S15d default map.
import { describe, expect, it } from 'vitest';
import { checkValue, effectiveValue, formValueOf, parseFormValue } from './values';
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
  resolveOverrides,
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
      // EZD-230: the rest of the 04 rail table and S15d default map.
      ceiling: 'G',
      catalog: 'P',
      dimension: 'L',
      text: 'T',
      sketch: 'S',
      'detail-callout': 'X',
      'revision-cloud': 'Q',
      reference: 'Shift+R',
      markup: 'Shift+M',
      'supplier-markup': 'Shift+S',
      measure: 'Shift+L',
      check: 'Shift+C',
      help: '?',
      pan: 'H',
      'look-up': 'U',
      'tab-plan': '1',
      'tab-3d': '2',
      'tab-sheets': '3',
      'tab-render': '4',
      undo: 'Mod+Z',
      redo: 'Mod+Shift+Z',
      copy: 'Mod+C',
      paste: 'Mod+V',
      save: 'Mod+S',
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
    // EZD-230: L is Dimension (04 Tool rail).
    expect(commandForKey(DEFAULT_BINDINGS, ev('l'))).toBe('dimension');
    // A shifted letter no command has runs the plain letter's command.
    expect(commandForKey(b, ev('B', { shift: true }))).toBe('wall');
    // EZD-230: Shift+R is Reference (04 Tool rail), so it no longer falls back to Room rectangle; Shift+W still does.
    expect(commandForKey(DEFAULT_BINDINGS, ev('R', { shift: true }))).toBe('reference');
    expect(commandForKey(DEFAULT_BINDINGS, ev('W', { shift: true }))).toBe('wall');
    // 04 Other default keys: Undo, Redo, Copy, Paste with Ctrl or Cmd.
    expect(commandForKey(DEFAULT_BINDINGS, ev('z', { ctrl: true }))).toBe('undo');
    expect(commandForKey(DEFAULT_BINDINGS, ev('Z', { meta: true, shift: true }))).toBe('redo');
    expect(commandForKey(DEFAULT_BINDINGS, ev('c', { meta: true }))).toBe('copy');
    expect(commandForKey(DEFAULT_BINDINGS, ev('v', { ctrl: true }))).toBe('paste');
    expect(commandForKey(DEFAULT_BINDINGS, ev('v'))).toBe('select');
  });

  it('a stored value that fails the check reads as the default map', () => {
    // EZD-230: a set key wins over another command's default key, which reads as cleared (resolveOverrides).
    expect(effectiveBindings({ wall: 'R' })).toEqual({
      ...DEFAULT_BINDINGS,
      wall: 'R',
      'room-rect': '',
    });
    expect(effectiveBindings({ wall: 'B', door: 'B' })).toEqual(DEFAULT_BINDINGS);
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

// EZD-230 (04 Tool rail "Default key", "Shown on"; S15d Reset to default map, "Keys are checked for collisions within
// the same view"; AC-EZD-230-2). Expected keys and views are the 04 table's, written out here.
describe('EZD-230 default key map', () => {
  const SPEC: Record<string, string> = {
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
    ceiling: 'G',
    catalog: 'P',
    dimension: 'L',
    text: 'T',
    sketch: 'S',
    'detail-callout': 'X',
    'revision-cloud': 'Q',
    reference: 'Shift+R',
    markup: 'Shift+M',
    'supplier-markup': 'Shift+S',
    measure: 'Shift+L',
    check: 'Shift+C',
    help: '?',
  };

  it('every 04 rail tool has its default key, and the default map has no clash in any view', () => {
    for (const [id, key] of Object.entries(SPEC)) expect(DEFAULT_BINDINGS[id], id).toBe(key);
    for (const id of Object.keys(DEFAULT_BINDINGS))
      expect(usedBy(DEFAULT_BINDINGS, id, DEFAULT_BINDINGS[id]), id).toBeNull();
    expect(checkOverrides({})).toBeNull();
  });

  it('AC-EZD-230-2: assigning R to two Plan commands is refused', () => {
    // Room rectangle has R; Dimension, Text, Reference and Sketch are Plan commands too.
    for (const id of ['dimension', 'text', 'reference', 'sketch', 'revision-cloud', 'wall']) {
      expect(refuseKey(DEFAULT_BINDINGS, id, 'R'), id).toBe('used');
      expect(usedBy(DEFAULT_BINDINGS, id, 'R')?.id, id).toBe('room-rect');
      expect(checkOverrides({ [id]: 'R' }), id).toBe('used');
    }
    // Two set keys clash too.
    expect(checkOverrides({ 'room-rect': 'B', text: 'R', sketch: 'R' })).toBe('used');
    // A key free in Plan is allowed.
    expect(checkOverrides({ 'room-rect': 'B', text: 'R' })).toBeNull();
  });

  it('collisions are per view: Pan (Sheets) and Look up (3D) may share a key; Pan and Text (Plan, Sheets) may not', () => {
    expect(refuseKey(DEFAULT_BINDINGS, 'pan', 'U')).toBeNull();
    expect(refuseKey(DEFAULT_BINDINGS, 'pan', 'T')).toBe('used');
    // Sketch is Plan only, Look up 3D only.
    expect(refuseKey(DEFAULT_BINDINGS, 'look-up', 'S')).toBeNull();
    expect(sharedView('text', 'pan')).toBe('sheets');
  });

  it('the Shift combos and digits are their own keys', () => {
    expect(commandForKey(DEFAULT_BINDINGS, ev('M', { shift: true }))).toBe('markup');
    expect(commandForKey(DEFAULT_BINDINGS, ev('S', { shift: true }))).toBe('supplier-markup');
    expect(commandForKey(DEFAULT_BINDINGS, ev('C', { shift: true }))).toBe('check');
    expect(commandForKey(DEFAULT_BINDINGS, ev('g'))).toBe('ceiling');
    expect(commandForKey(DEFAULT_BINDINGS, ev('2'))).toBe('tab-3d');
    expect(commandForKey(DEFAULT_BINDINGS, ev('s', { ctrl: true }))).toBe('save');
  });

  it('a stored key wins over a later default key: that command reads Not set until the owner saves', () => {
    // The owner gave G to Wall before Ceiling had G.
    expect(resolveOverrides({ wall: 'G' })).toEqual({ wall: 'G', ceiling: '' });
    const b = effectiveBindings({ wall: 'G' });
    expect(b.wall).toBe('G');
    expect(b.ceiling).toBe('');
    expect(commandForKey(b, ev('g'))).toBe('wall');
    // Saving that read stores the cleared row and passes the strict check.
    expect(checkOverrides(overridesOf(b))).toBeNull();
    expect(overridesOf(b)).toEqual({ wall: 'G', ceiling: '' });
    // The strict save check still refuses the bare map.
    expect(checkOverrides({ wall: 'G' })).toBe('used');
    // Reset to default map does not give G back to Ceiling while Wall has it.
    expect(resetToDefaultMap(b).ceiling).toBe('');
    // Bad maps read as the default map.
    expect(resolveOverrides({ wall: 'Mod+W' })).toBeNull();
    expect(resolveOverrides({ nope: 'B' })).toBeNull();
    expect(resolveOverrides({})).toEqual({});
  });

  it('the Defaults row reads a stored map with the cleared rows', () => {
    expect(effectiveValue('keyboard_shortcuts', { keyboard_shortcuts: { wall: 'G' } })).toEqual({
      wall: 'G',
      ceiling: '',
    });
    expect(effectiveValue('keyboard_shortcuts', { keyboard_shortcuts: { wall: 'B' } })).toEqual({
      wall: 'B',
    });
    expect(effectiveValue('keyboard_shortcuts', { keyboard_shortcuts: { wall: 'Mod+W' } })).toEqual(
      {},
    );
    expect(effectiveValue('keyboard_shortcuts', {})).toEqual({});
  });
});
