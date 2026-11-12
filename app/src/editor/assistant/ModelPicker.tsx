'use client';
// EZD-5603a Build step 9 (vault/plans/EZD-5603a.md section 3 V3, V4; Decided "Picker", "Touch"; board
// S03cAIAssistant.dc.html lines 161-168; Q-0638 gap 13; Q-0656 (a)): the model button under the prompt and the
// list it opens above the prompt area. Outside press and Escape as components/menu/Menu.tsx.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../components/icon/Icon';
import type { AssistantModel } from '../../lib/assistant/cost';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import styles from './AssistantPanel.module.css';

const OPTIONS: readonly { model: AssistantModel; name: MessageKey; cost: MessageKey }[] = [
  {
    model: 'sonnet',
    name: 'office.assistant.model_sonnet',
    cost: 'office.assistant.model_sonnet_cost',
  },
  { model: 'opus', name: 'office.assistant.model_opus', cost: 'office.assistant.model_opus_cost' },
];

const SHORT: Record<AssistantModel, MessageKey> = {
  sonnet: 'office.assistant.model_sonnet_short',
  opus: 'office.assistant.model_opus_short',
};

// V4
export function ModelList({
  model,
  onPick,
}: {
  model: AssistantModel;
  onPick(model: AssistantModel): void;
}) {
  const t = useT();
  return (
    <div
      className={styles.modelList}
      role="listbox"
      aria-label={t('office.assistant.model')}
      data-testid="assistant-model-list"
    >
      <span className={styles.modelHeading}>{t('office.assistant.model_heading')}</span>
      {OPTIONS.map((o) => {
        const current = o.model === model;
        return (
          <button
            key={o.model}
            type="button"
            role="option"
            aria-selected={current}
            className={`${styles.option} ${current ? styles.optionOn : ''} ${touch.target}`}
            data-testid={`assistant-model-${o.model}`}
            onClick={() => onPick(o.model)}
          >
            <span className={styles.optionText}>
              <span className={current ? styles.optionNameOn : styles.optionName}>{t(o.name)}</span>
              <span className={styles.optionCost}>{t(o.cost)}</span>
            </span>
            {current ? (
              <span className={styles.optionCheck}>
                <Icon name="check" size={18} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// V3
export function ModelPicker({
  model,
  disabled,
  onChange,
}: {
  model: AssistantModel;
  disabled: boolean;
  onChange(model: AssistantModel): void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = open && !disabled;

  // A press or focus outside the picker closes the list; listening only while it is open.
  useEffect(() => {
    if (!shown) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && rootRef.current?.contains(target) === true;
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [shown]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (shown && e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={styles.picker} ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`${styles.modelButton} ${touch.target}`}
        aria-haspopup="listbox"
        aria-expanded={shown}
        aria-label={t('office.assistant.model')}
        data-testid="assistant-model"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {t(SHORT[model])}
        <span className={styles.modelChevron}>
          <Icon name={shown ? 'expand_less' : 'expand_more'} size={18} />
        </span>
      </button>
      {shown ? (
        <ModelList
          model={model}
          onPick={(m) => {
            onChange(m);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
