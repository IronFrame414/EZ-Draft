// Typed dimension bar reducer (EZD-209; S03 Typed dimension bar; 04 Measurement entry). Pure: no React, no DOM.
import {
  LENGTH_REFUSED_MESSAGE_KEY,
  TURN_REFUSED_MESSAGE_KEY,
  parseLength,
  parseTurnAngle,
  type LengthFieldKind,
} from '@ezdraft/geometry';
import type { IconName } from '../../components/icon/icon-names.generated';
import type { MessageKey } from '../../server/messages/catalog';

export type TypedLengthField = {
  readonly id: string;
  readonly label: MessageKey;
  readonly kind: 'length';
  readonly lengthKind: LengthFieldKind;
  readonly optional: boolean;
};
export type TypedAngleField = {
  readonly id: string;
  readonly label: MessageKey;
  readonly kind: 'angle';
  readonly optional: boolean;
};
export type TypedField = TypedLengthField | TypedAngleField;

export type TypedTool = {
  readonly id: string;
  readonly icon: IconName;
  readonly fields: readonly [TypedField, ...TypedField[]];
};

export const WALL_LENGTH_FIELD: TypedLengthField = {
  id: 'length',
  label: 'office.typed.field.length',
  kind: 'length',
  lengthKind: 'wall_room',
  optional: false,
};
export const TURN_ANGLE_FIELD: TypedAngleField = {
  id: 'angle',
  label: 'office.typed.field.angle',
  kind: 'angle',
  optional: true,
};

export type TypedValues = Readonly<Record<string, number | null>>;

export type TypedEntryState = {
  readonly open: boolean;
  readonly active: number;
  readonly texts: readonly string[];
  readonly error: MessageKey | null;
  readonly anchor: 'cursor' | 'bar';
};

export type TypedEntryAction =
  | { type: 'open'; text: string; anchor: 'cursor' | 'bar' }
  | { type: 'edit'; text: string }
  | { type: 'append'; text: string }
  | { type: 'tab'; back: boolean }
  | { type: 'enter' }
  | { type: 'escape' };

export type TypedEntryStep = {
  state: TypedEntryState;
  commit: TypedValues | null;
  handled: boolean;
};

export function initialTypedEntryState(tool: TypedTool): TypedEntryState {
  return { open: false, active: 0, texts: tool.fields.map(() => ''), error: null, anchor: 'cursor' };
}

type Validated = { ok: true; value: number | null } | { ok: false; key: MessageKey };

function validateField(field: TypedField, text: string): Validated {
  if (text.trim() === '') {
    if (field.optional) return { ok: true, value: null };
    return { ok: false, key: field.kind === 'length' ? LENGTH_REFUSED_MESSAGE_KEY : TURN_REFUSED_MESSAGE_KEY };
  }
  if (field.kind === 'length') {
    const r = parseLength(text, field.lengthKind);
    return r.ok ? { ok: true, value: r.inches } : { ok: false, key: r.messageKey };
  }
  const r = parseTurnAngle(text);
  return r.ok ? { ok: true, value: r.degrees } : { ok: false, key: r.messageKey };
}

function withText(state: TypedEntryState, text: string): TypedEntryState {
  const texts = state.texts.map((x, i) => (i === state.active ? text : x));
  return { ...state, texts, error: null };
}

export function reduceTypedEntry(
  tool: TypedTool,
  state: TypedEntryState,
  action: TypedEntryAction,
): TypedEntryStep {
  const unchanged: TypedEntryStep = { state, commit: null, handled: false };
  if (!state.open) {
    if (action.type !== 'open') return unchanged;
    const texts = tool.fields.map((_, i) => (i === 0 ? action.text : ''));
    return {
      state: { open: true, active: 0, texts, error: null, anchor: action.anchor },
      commit: null,
      handled: true,
    };
  }
  const n = tool.fields.length;
  switch (action.type) {
    case 'open':
    case 'append':
      return {
        state: withText(state, (state.texts[state.active] ?? '') + action.text),
        commit: null,
        handled: true,
      };
    case 'edit':
      return { state: withText(state, action.text), commit: null, handled: true };
    case 'tab': {
      const text = state.texts[state.active] ?? '';
      const field = tool.fields[state.active]!;
      if (text.trim() !== '') {
        const v = validateField(field, text);
        if (!v.ok) return { state: { ...state, error: v.key }, commit: null, handled: true };
      }
      const active = action.back ? (state.active - 1 + n) % n : (state.active + 1) % n;
      return { state: { ...state, active, error: null }, commit: null, handled: true };
    }
    case 'enter': {
      const values: Record<string, number | null> = {};
      for (let i = 0; i < n; i++) {
        const field = tool.fields[i]!;
        const v = validateField(field, state.texts[i] ?? '');
        if (!v.ok) return { state: { ...state, active: i, error: v.key }, commit: null, handled: true };
        values[field.id] = v.value;
      }
      return { state: initialTypedEntryState(tool), commit: values, handled: true };
    }
    case 'escape':
      return { state: initialTypedEntryState(tool), commit: null, handled: true };
  }
}

export function isOpenKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}): boolean {
  return /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing;
}

export function isTypingTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable === true
  );
}
