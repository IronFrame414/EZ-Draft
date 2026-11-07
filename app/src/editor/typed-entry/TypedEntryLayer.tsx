'use client';
// Typed dimension bar and inline box (EZD-209; S03 Typed dimension bar; 04 Measurement entry).
// Not mounted in the real editor: EZD-210 mounts it with the first real tools.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, Ref } from 'react';
import { PLAN_DISPLAY_DENOMINATOR, formatLength } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import {
  initialTypedEntryState,
  isOpenKey,
  isTypingTarget,
  reduceTypedEntry,
  type TypedEntryAction,
  type TypedEntryState,
  type TypedTool,
  type TypedValues,
} from './typed-entry';
import styles from './TypedEntryLayer.module.css';

export function TypedBar({
  tool,
  state,
  lastValues,
  onFieldPress,
}: {
  tool: TypedTool;
  state: TypedEntryState;
  lastValues: Readonly<Record<string, number>>;
  onFieldPress: () => void;
}) {
  const t = useT();
  const field = tool.fields[state.active] ?? tool.fields[0];
  const last = lastValues[field.id];
  return (
    <div className={styles.bar} data-testid="typed-bar">
      <button
        type="button"
        className={`${styles.chip} ${touch.hitArea}`}
        data-testid="typed-bar-field"
        onClick={onFieldPress}
      >
        <Icon name={tool.icon} size={16} />
        <span className={styles.chipLabel} data-testid="typed-bar-label">
          {t(field.label)}
        </span>
        {field.kind === 'length' && last !== undefined ? (
          <span className={styles.chipValue} data-testid="typed-bar-value">
            {formatLength(last, PLAN_DISPLAY_DENOMINATOR)}
          </span>
        ) : null}
      </button>
      {state.error !== null ? (
        <span className={styles.error} role="alert" data-testid="typed-bar-error">
          {t(state.error)}
        </span>
      ) : (
        <span className={styles.hint} data-testid="typed-bar-hint">
          {t(field.kind === 'length' ? 'office.typed.hint_length' : 'office.typed.hint_angle')}
        </span>
      )}
      {tool.fields.length > 1 ? (
        <span className={styles.tab} data-testid="typed-bar-tab">
          {t('office.typed.tab')}
        </span>
      ) : null}
    </div>
  );
}

export function InlineBox({
  tool,
  state,
  onEdit,
  onKeyDown,
  inputRef,
  boxRef,
}: {
  tool: TypedTool;
  state: TypedEntryState;
  onEdit: (text: string) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  boxRef?: Ref<HTMLDivElement>;
}) {
  const t = useT();
  const field = tool.fields[state.active] ?? tool.fields[0];
  return (
    <div className={styles.box} data-testid="typed-box" ref={boxRef}>
      <span data-testid="typed-box-label">{t(field.label)}</span>
      <input
        ref={inputRef}
        className={styles.boxInput}
        data-testid="typed-box-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={32}
        aria-label={t(field.label)}
        aria-invalid={state.error !== null}
        value={state.texts[state.active] ?? ''}
        onChange={(e) => onEdit(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

type LayerProps = {
  tool: TypedTool | null;
  canEdit: boolean;
  lastValues: Readonly<Record<string, number>>;
  getCursor: () => { x: number; y: number } | null;
  onCommit: (values: TypedValues) => void;
};

export function TypedEntryLayer(props: LayerProps) {
  const { tool, canEdit } = props;
  if (tool === null || !canEdit) return null;
  return <LayerInner key={tool.id} {...props} tool={tool} />;
}

function LayerInner({
  tool,
  lastValues,
  getCursor,
  onCommit,
}: LayerProps & { tool: TypedTool }) {
  const [state, setState] = useState<TypedEntryState>(() => initialTypedEntryState(tool));
  const stateRef = useRef(state);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const getCursorRef = useRef(getCursor);
  const onCommitRef = useRef(onCommit);
  useLayoutEffect(() => {
    getCursorRef.current = getCursor;
    onCommitRef.current = onCommit;
  });

  const dispatch = useCallback(
    (action: TypedEntryAction) => {
      const step = reduceTypedEntry(tool, stateRef.current, action);
      stateRef.current = step.state;
      setState(step.state);
      if (step.commit !== null) onCommitRef.current(step.commit);
    },
    [tool],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target === inputRef.current) return;
      const typing = isTypingTarget(e.target);
      let action: TypedEntryAction | null = null;
      if (!stateRef.current.open) {
        if (isOpenKey(e) && !typing) action = { type: 'open', text: e.key, anchor: 'cursor' };
      } else if (!typing) {
        if (isOpenKey(e)) action = { type: 'append', text: e.key };
        else if (e.key === 'Tab') action = { type: 'tab', back: e.shiftKey };
        else if (e.key === 'Enter') action = { type: 'enter' };
        else if (e.key === 'Escape') action = { type: 'escape' };
      }
      if (action === null) return;
      e.preventDefault();
      e.stopPropagation();
      dispatch(action);
      if (action.type === 'append') inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [dispatch]);

  useLayoutEffect(() => {
    if (!state.open) return;
    inputRef.current?.focus();
    const root = rootRef.current;
    const box = boxRef.current;
    const bar = root?.querySelector<HTMLElement>('[data-testid="typed-bar"]') ?? null;
    if (root === null || box === null || bar === null) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const p = state.anchor === 'cursor' ? getCursorRef.current() : null;
    let left: number;
    let top: number;
    if (p === null) {
      left = Math.round((W - w) / 2);
      top = bar.offsetTop - h - 8;
    } else {
      left = Math.max(8, Math.min(p.x + 12, W - w - 8));
      top = Math.max(8, Math.min(p.y + 12, H - h - 8));
    }
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    // Positioned only when the box opens, not on Tab (D-Pos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    let action: TypedEntryAction | null = null;
    if (e.key === 'Tab') action = { type: 'tab', back: e.shiftKey };
    else if (e.key === 'Enter') action = { type: 'enter' };
    else if (e.key === 'Escape') action = { type: 'escape' };
    e.stopPropagation();
    if (action === null) return;
    e.preventDefault();
    dispatch(action);
  };

  const onFieldPress = () => {
    if (stateRef.current.open) inputRef.current?.focus();
    else dispatch({ type: 'open', text: '', anchor: 'bar' });
  };

  return (
    <div className={styles.root} data-testid="typed-entry-layer" ref={rootRef}>
      <TypedBar tool={tool} state={state} lastValues={lastValues} onFieldPress={onFieldPress} />
      {state.open ? (
        <InlineBox
          tool={tool}
          state={state}
          onEdit={(text) => dispatch({ type: 'edit', text })}
          onKeyDown={onInputKeyDown}
          inputRef={inputRef}
          boxRef={boxRef}
        />
      ) : null}
    </div>
  );
}
