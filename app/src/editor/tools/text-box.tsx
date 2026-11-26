'use client';
// EZD-216 (Q-0683 (a) "a click opens a text box in place on the canvas (Enter commits, Esc cancels)"; Q-0687 (b) a
// note takes several lines with Shift+Enter, at most 500 characters; S03 canvas "Double-click | Edits the object in
// place"; AC-EZD-216-3, -5): the in-place text box at a model point, kept there through pans and zooms. Leaving the
// box commits it, as Enter does; a refused text keeps the box open.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { DIMENSION_OVERRIDE_MAX_CHARS, TEXT_MAX_CHARS } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { PlanCanvasHandle } from '../plan/controller';
import type { TextBoxUi } from './drawing-controller';
import styles from './DrawingTools.module.css';

export type TextBoxProps = {
  box: TextBoxUi;
  handle: Pick<PlanCanvasHandle, 'modelToScreen' | 'onCameraChange'>;
  onCommit: (value: string) => boolean;
  onCancel: () => void;
};

export function CanvasTextBox({ box, handle, onCommit, onCancel }: TextBoxProps) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const place = () => {
      const s = handle.modelToScreen(box.at);
      el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    };
    place();
    return handle.onCameraChange(place);
  }, [box.at, handle]);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [box.seq]);

  const commit = () => {
    if (done.current) return;
    const el = ref.current;
    if (el === null) return;
    if (onCommit(el.value)) done.current = true;
    else el.focus();
  };

  return (
    <textarea
      ref={ref}
      data-testid="canvas-text-box"
      aria-label={t(box.multiline ? 'office.tools.text.box' : 'office.tools.text.override_box')}
      className={styles.textBox}
      defaultValue={box.initial}
      rows={box.multiline ? 3 : 1}
      maxLength={box.multiline ? TEXT_MAX_CHARS : DIMENSION_OVERRIDE_MAX_CHARS}
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        } else if (e.key === 'Enter' && !(box.multiline && e.shiftKey)) {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
    />
  );
}
