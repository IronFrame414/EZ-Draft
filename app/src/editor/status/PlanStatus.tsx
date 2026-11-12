'use client';
// EZD-219 Build step 14 (vault/plans/EZD-219.md Decided "Popover", "Options", "Status markup", "Readouts", "Zoom
// field", "Messages", "Failed banner"; section 3; S03 Controls — status bar; 09m; Q-0664; Q-0680 (b); 11 rule 4):
// the plan's status bar items. Scale and Snap open popovers; Cursor and Zoom are readouts written through a ref
// from the handle's listeners, never React state; a click on Zoom swaps in a typed-zoom field.
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { StatusItem } from '../../components/shell/StatusBar';
import { InlineError } from '../../components/states/InlineError';
import { useT } from '../../lib/messages';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import { PLAN_SCALES } from '../../lib/plan/plan-scale';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { PlanCanvasHandle } from '../plan/controller';
import { parseZoomPercent } from '../plan/view';
import styles from './PlanStatus.module.css';
import {
  PLAN_SCALE_LABELS,
  SNAP_INCREMENTS_IN,
  formatCursor,
  snapIncrementLabel,
  type ScaleSetting,
  type SnapSettingsStore,
  type SnapToggle,
} from './view-settings';

const SNAP_TOGGLES: ReadonlyArray<{ kind: SnapToggle; label: MessageKey }> = [
  { kind: 'endpoints', label: 'office.status.snap_endpoints' },
  { kind: 'midpoints', label: 'office.status.snap_midpoints' },
  { kind: 'angles', label: 'office.status.snap_angles' },
  { kind: 'faces', label: 'office.status.snap_faces' },
];

const triggerClass = `${styles.trigger} ${touch.hitArea}`;
const optionClass = `${styles.option} ${touch.target}`;
const switchClass = `${styles.switchRow} ${touch.hitArea}`;

// Decided "Popover": a trigger and a dialog rendered only while open, inside the item. Document listeners only
// while open: Escape (focus back to the trigger), a press outside the item, focus moving outside the item.
function StatusPopover({
  testId,
  label,
  value,
  dialogLabel,
  focusSelector,
  children,
}: {
  testId: string;
  label: MessageKey;
  value: string;
  dialogLabel: MessageKey;
  focusSelector: string;
  children: (close: () => void) => ReactNode;
}): ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // A choice closes the popover and focuses the trigger (ARCH Menus); the focus is moved in an effect.
  const [focusRequest, setFocusRequest] = useState(0);
  const closeAfterChoice = () => {
    setOpen(false);
    setFocusRequest((n) => n + 1);
  };

  useEffect(() => {
    if (focusRequest > 0) triggerRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(focusSelector)?.focus();
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) || !(itemRef.current?.contains(target) ?? false);
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (outside(e.target)) setOpen(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (outside(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, focusSelector]);

  return (
    <div ref={itemRef} className={styles.item} data-status-item="">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.label} data-status-label="">
          {t(label)}
        </span>
        <span className={styles.value} data-status-value="">
          {value}
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t(dialogLabel)}
          className={styles.popover}
          data-testid={`${testId}-popover`}
        >
          {children(closeAfterChoice)}
        </div>
      ) : null}
    </div>
  );
}

export function PlanStatusStart(props: {
  scale: ScaleSetting;
  snap: SnapSettingsStore;
}): ReactElement {
  const t = useT();
  const { scale: scaleSetting, snap } = props;
  const scale = useSyncExternalStore(scaleSetting.subscribe, scaleSetting.get, scaleSetting.get);
  const settings = useSyncExternalStore(snap.subscribe, snap.get, snap.get);
  return (
    <>
      <StatusPopover
        testId="status-scale"
        label="office.status.scale"
        value={PLAN_SCALE_LABELS[scale]}
        dialogLabel="office.status.scale_title"
        focusSelector='[role="radio"][aria-checked="true"]'
      >
        {(close) => (
          <div
            className={styles.group}
            role="radiogroup"
            aria-label={t('office.status.scale_title')}
          >
            {PLAN_SCALES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === scale}
                data-value={String(s)}
                className={optionClass}
                onClick={() => {
                  scaleSetting.set(s);
                  close();
                }}
              >
                {PLAN_SCALE_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </StatusPopover>
      <StatusPopover
        testId="status-snap"
        label="office.status.snap"
        value={snapIncrementLabel(settings.incrementIn)}
        dialogLabel="office.status.snap_title"
        focusSelector='[role="switch"]'
      >
        {() => (
          <>
            <div className={styles.group}>
              {SNAP_TOGGLES.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  role="switch"
                  aria-checked={settings[kind]}
                  data-testid={`status-snap-${kind}`}
                  className={switchClass}
                  onClick={() => snap.setToggle(kind, !settings[kind])}
                >
                  <span>{t(label)}</span>
                  <span className={styles.knob} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className={styles.heading}>{t('office.status.snap_increment')}</div>
            <div
              className={styles.group}
              role="radiogroup"
              aria-label={t('office.status.snap_increment')}
            >
              {SNAP_INCREMENTS_IN.map((inches) => (
                <button
                  key={inches}
                  type="button"
                  role="radio"
                  aria-checked={inches === settings.incrementIn}
                  data-value={String(inches)}
                  className={optionClass}
                  onClick={() => snap.setIncrement(inches)}
                >
                  {snapIncrementLabel(inches)}
                </button>
              ))}
            </div>
          </>
        )}
      </StatusPopover>
    </>
  );
}

export function PlanStatusEnd(props: {
  handle: Pick<
    PlanCanvasHandle,
    'onCursorChange' | 'onCameraChange' | 'getZoomPercent' | 'setZoomPercent'
  >;
}): ReactElement {
  const t = useT();
  const { handle } = props;
  const cursorRef = useRef<HTMLSpanElement>(null);
  const zoomButtonRef = useRef<HTMLButtonElement>(null);
  const zoomValueRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  // The field closes once: Enter, Escape or blur, whichever comes first.
  const closedRef = useRef(false);

  useEffect(() => {
    const el = cursorRef.current;
    if (el === null) return;
    const none = t('office.status.cursor_none');
    el.textContent = none;
    return handle.onCursorChange((model) => {
      el.textContent = model === null ? none : formatCursor(model);
    });
  }, [handle, t]);

  useEffect(() => {
    if (editing) return;
    const write = () => {
      const percent = handle.getZoomPercent();
      const name = t('office.status.zoom', { percent });
      if (zoomValueRef.current !== null) zoomValueRef.current.textContent = `${percent}%`;
      zoomButtonRef.current?.setAttribute('aria-label', name);
      zoomButtonRef.current?.setAttribute('title', name);
    };
    write();
    return handle.onCameraChange(write);
  }, [handle, t, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [editing]);

  const close = (apply: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (apply && inputRef.current !== null) {
      const percent = parseZoomPercent(inputRef.current.value);
      if (percent !== null) handle.setZoomPercent(percent);
    }
    setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(false);
    }
  };

  return (
    <>
      <StatusItem label="office.status.cursor">
        <span ref={cursorRef} data-testid="status-cursor" />
      </StatusItem>
      <div className={styles.item} data-status-item="">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className={styles.zoomInput}
            data-testid="status-zoom-input"
            aria-label={t('office.status.zoom_input')}
            defaultValue={String(handle.getZoomPercent())}
            onKeyDown={onKeyDown}
            onBlur={() => close(false)}
          />
        ) : (
          <button
            ref={zoomButtonRef}
            type="button"
            className={triggerClass}
            data-testid="status-zoom"
            onClick={() => {
              closedRef.current = false;
              setEditing(true);
            }}
          >
            <span ref={zoomValueRef} className={styles.value} data-status-value="" />
          </button>
        )}
      </div>
    </>
  );
}

export function PlanScaleFailedBanner(props: {
  scale: ScaleSetting;
  sync: OutboxSync;
}): ReactElement | null {
  const failed = useSyncExternalStore(
    props.scale.subscribe,
    props.scale.failed,
    props.scale.failed,
  );
  const status = useStore(props.sync, (s) => s.status);
  if (!failed || status === 'error') return null;
  return (
    <div data-testid="scale-save-failed-banner">
      <InlineError message="office.editor.save_failed" onRetry={() => props.scale.retry()} />
    </div>
  );
}
