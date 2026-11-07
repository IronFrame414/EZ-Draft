// EZD-209 R1-R7 (vault/plans/EZD-209.md section 4).
import { describe, expect, it } from 'vitest';
import {
  TURN_ANGLE_FIELD,
  WALL_LENGTH_FIELD,
  initialTypedEntryState,
  isOpenKey,
  isTypingTarget,
  reduceTypedEntry,
  type TypedEntryAction,
  type TypedEntryState,
  type TypedEntryStep,
  type TypedTool,
  type TypedValues,
} from './typed-entry';

const STUB: TypedTool = {
  id: 'stub',
  icon: 'straighten',
  fields: [WALL_LENGTH_FIELD, TURN_ANGLE_FIELD],
};
const ONE: TypedTool = { id: 'one', icon: 'straighten', fields: [WALL_LENGTH_FIELD] };
const LEN = 'office.length.refused';
const ANG = 'office.typed.angle_refused';

function run(tool: TypedTool, actions: TypedEntryAction[]) {
  let state: TypedEntryState = initialTypedEntryState(tool);
  const steps: TypedEntryStep[] = [];
  for (const a of actions) {
    const step = reduceTypedEntry(tool, state, a);
    steps.push(step);
    state = step.state;
  }
  return { state, steps, last: steps[steps.length - 1]! };
}
const open = (text: string, anchor: 'cursor' | 'bar' = 'cursor'): TypedEntryAction => ({
  type: 'open',
  text,
  anchor,
});
const edit = (text: string): TypedEntryAction => ({ type: 'edit', text });
const tab = (back = false): TypedEntryAction => ({ type: 'tab', back });
const enter: TypedEntryAction = { type: 'enter' };
const escape: TypedEntryAction = { type: 'escape' };

describe('EZD-209 typed entry reducer', () => {
  it('EZD-209 R1 done when: 12\'6" Tab 90 Enter emits one commit of 150 and 90', () => {
    const { steps, state } = run(STUB, [open('1'), edit('12\'6"'), tab(false), edit('90'), enter]);
    const commits = steps.map((s) => s.commit).filter((c): c is TypedValues => c !== null);
    expect(commits).toEqual([{ length: 150, angle: 90 }]);
    expect(steps[4]!.commit).toEqual({ length: 150, angle: 90 });
    expect(state).toEqual(initialTypedEntryState(STUB));
  });

  it('EZD-209 R2 Tab order', () => {
    const a = run(STUB, [open('1'), edit("12'")]);
    const t1 = reduceTypedEntry(STUB, a.state, tab(false));
    expect(t1.state.active).toBe(1);
    const e1 = reduceTypedEntry(STUB, t1.state, edit('45'));
    const t2 = reduceTypedEntry(STUB, e1.state, tab(false));
    expect(t2.state.active).toBe(0);
    expect(t2.state.texts).toEqual(["12'", '45']);
    const t3 = reduceTypedEntry(STUB, t2.state, tab(true));
    expect(t3.state.active).toBe(1);
    expect(t3.state.texts).toEqual(["12'", '45']);
    const o = run(ONE, [open('1'), edit("12'"), tab(false)]);
    expect(o.state.active).toBe(0);
  });

  it('EZD-209 R3 refused length', () => {
    const a = run(STUB, [open('1'), edit('12 6'), enter]);
    expect(a.last.commit).toBeNull();
    expect(a.state.open).toBe(true);
    expect(a.state.active).toBe(0);
    expect(a.state.error).toBe(LEN);
    const b = reduceTypedEntry(STUB, a.state, tab(false));
    expect(b.state.active).toBe(0);
    expect(b.state.error).toBe(LEN);
    const c = reduceTypedEntry(STUB, b.state, edit('12'));
    expect(c.state.error).toBeNull();
  });

  it('EZD-209 R4 wall limits through the reducer', () => {
    for (const text of ['0', '200\' 0 1/16"']) {
      const r = run(STUB, [open('1'), edit(text), enter]);
      expect(r.last.commit, text).toBeNull();
      expect(r.state.open, text).toBe(true);
      expect(r.state.error, text).toBe(LEN);
    }
    const ok = run(STUB, [open('1'), edit("200'"), enter]);
    expect(ok.last.commit).toEqual({ length: 2400, angle: null });
  });

  it('EZD-209 R5 refused and accepted angles', () => {
    for (const angle of ['180', '200', '-90']) {
      const r = run(STUB, [open('1'), edit("10'"), tab(false), edit(angle), enter]);
      expect(r.last.commit, angle).toBeNull();
      expect(r.state.open, angle).toBe(true);
      expect(r.state.active, angle).toBe(1);
      expect(r.state.error, angle).toBe(ANG);
    }
    const accepted: Array<[string, number]> = [
      ['0', 0],
      ['45', 45],
      ['12.5', 12.5],
    ];
    for (const [angle, deg] of accepted) {
      const r = run(STUB, [open('1'), edit("10'"), tab(false), edit(angle), enter]);
      expect(r.last.commit, angle).toEqual({ length: 120, angle: deg });
    }
  });

  it('EZD-209 R6 empty fields', () => {
    const a = run(STUB, [open('', 'bar'), enter]);
    expect(a.last.commit).toBeNull();
    expect(a.state.error).toBe(LEN);
    expect(a.state.active).toBe(0);
    const b = run(STUB, [open('1', 'cursor'), edit("12'"), enter]);
    expect(b.last.commit).toEqual({ length: 144, angle: null });
  });

  it('EZD-209 R7 Esc and key predicates', () => {
    const o = run(STUB, [open('1'), escape]);
    expect(o.state).toEqual(initialTypedEntryState(STUB));
    expect(o.last.handled).toBe(true);
    expect(o.last.commit).toBeNull();
    const closed = initialTypedEntryState(STUB);
    const c = reduceTypedEntry(STUB, closed, escape);
    expect(c.state).toEqual(closed);
    expect(c.handled).toBe(false);

    const base = { key: '7', ctrlKey: false, metaKey: false, altKey: false, isComposing: false };
    expect(isOpenKey(base)).toBe(true);
    expect(isOpenKey({ ...base, key: '.' })).toBe(false);
    expect(isOpenKey({ ...base, key: 'a' })).toBe(false);
    expect(isOpenKey({ ...base, ctrlKey: true })).toBe(false);
    expect(isOpenKey({ ...base, metaKey: true })).toBe(false);
    expect(isOpenKey({ ...base, altKey: true })).toBe(false);
    expect(isOpenKey({ ...base, isComposing: true })).toBe(false);

    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
