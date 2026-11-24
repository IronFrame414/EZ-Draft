'use client';
// Tool rail: controlled, no state, CSS-only tooltip (vault/plans/EZD-012a.md Step 5; 04 Tool rail).
// EZD-5605 (D-Tools off): with `only` set, every other tool is disabled (greyed) too.
// EZD-225 (S06:48; S06 board line 93; Q-0697 decisions 05): the tools in `paused` are disabled and shown at 55%.
// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122): with `onReorder`, a top tool is
// dragged up or down the rail to a new place, or moved one place with Alt+Up or Alt+Down; the rail reports the top
// tools' ids in their new order. A drag starts after the pointer moves 8 px and does not also press the tool.
// EZD-1973: a finger or pen lifted on a movable tool without a drag turns it on at pointer up (rail-press.ts).
// EZD-230 (Q-0038 (b)): when the top tools do not fit the rail's height, the last place is a "More tools" button that
// opens a flyout beside the rail with the tools that do not fit; picking one closes it, as Esc and a press outside do.
// The rail measures its top group with a ResizeObserver (a size change, not a pointer or scroll listener).
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import { moveRailTool, type RailEntry, type RailTool } from './rail-types';
import { createRailPress } from './rail-press';
import styles from './ToolRail.module.css';
import moreStyles from './RailMore.module.css';

// ToolRail.module.css: .group gap, .separator height and margins.
const GAP_PX = 2;
const SEPARATOR_PX = 13;
export const MORE_TOOLS_ID = 'more-tools';

export function ToolRail({
  top,
  bottom,
  activeId,
  pressedIds,
  onSelect,
  disabled,
  only,
  paused,
  onReorder,
}: {
  top: RailEntry[];
  bottom: RailTool[];
  activeId: string | null;
  pressedIds?: readonly string[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  only?: string;
  paused?: readonly string[];
  onReorder?: (ids: string[]) => void;
}) {
  const t = useT();
  const topRef = useRef<HTMLDivElement>(null);
  const [rp] = useState(createRailPress);
  const [dragging, setDragging] = useState<string | null>(null);
  const topIds = top.flatMap((e) => (e.kind === 'tool' ? [e.id] : []));
  const movable = (id: string) => onReorder !== undefined && topIds.includes(id);
  // How many top entries show when they do not all fit; null when they do.
  const [fit, setFit] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const shape = top.map((e) => (e.kind === 'tool' ? e.id : '|')).join();
  useLayoutEffect(() => {
    const el = topRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const slot = el.querySelector<HTMLElement>('[data-rail-slot]')?.offsetHeight ?? 0;
      if (slot === 0) return;
      const sizes = shape.split(',').map((x) => (x === '|' ? SEPARATOR_PX : slot) + GAP_PX);
      const room = el.clientHeight + GAP_PX;
      if (sizes.reduce((a, b) => a + b, 0) <= room) {
        setFit(null);
        return;
      }
      let used = slot + GAP_PX;
      let n = 0;
      while (n < sizes.length && used + sizes[n]! <= room) used += sizes[n++]!;
      setFit(n);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shape]);
  const shownTop = fit === null ? top : top.slice(0, fit);
  const moreTools = fit === null ? [] : top.slice(fit).filter((e): e is RailTool => e.kind === 'tool');
  const moreShown = moreOpen && moreTools.length > 0;
  useEffect(() => {
    if (!moreShown) return;
    const away = (e: Event) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMoreOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [moreShown]);

  // The top slot whose middle is nearest the pointer.
  const slotAt = (y: number): number => {
    const slots = [...(topRef.current?.querySelectorAll<HTMLElement>('[data-rail-slot]') ?? [])];
    let best = 0;
    let dist = Infinity;
    slots.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  };

  // EZD-1973: rail-press.ts decides what a press is (a drag, a finger tap, or a mouse press its click ends).
  const onPointerDown = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!movable(id) || e.button !== 0) rp.clear();
    else rp.down({ id, pointer: e.pointerId, y: e.clientY, type: e.pointerType });
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!rp.move({ pointer: e.pointerId, y: e.clientY })) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(e.currentTarget.getAttribute('data-rail-tool'));
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const end = rp.up({ pointer: e.pointerId, time: e.timeStamp, inside });
    if (end === null) return;
    if (end.kind === 'tap') {
      if (!e.currentTarget.disabled) onSelect(end.id);
      return;
    }
    setDragging(null);
    const next = moveRailTool(topIds, end.id, slotAt(e.clientY));
    if (next.join() !== topIds.join()) onReorder?.(next);
  };
  const onPointerCancel = () => {
    rp.cancel();
    setDragging(null);
  };
  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!movable(id) || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const from = topIds.indexOf(id);
    const next = moveRailTool(topIds, id, from + (e.key === 'ArrowUp' ? -1 : 1));
    if (next.join() !== topIds.join()) onReorder?.(next);
  };

  const renderTool = (tool: RailTool, inTop: boolean) => (
    <div
      className={styles.slot}
      key={tool.id}
      data-rail-slot={inTop ? '' : undefined}
      data-rail-dragging={dragging === tool.id ? '' : undefined}
    >
      <button
        type="button"
        className={styles.tool}
        data-rail-tool={tool.id}
        data-rail-paused={paused?.includes(tool.id) ? '' : undefined}
        // EZD-230 (Q-0630 tablet rule): a movable tool takes touch and pen drags itself (touch-action: none).
        data-rail-movable={inTop && onReorder ? '' : undefined}
        aria-label={t(tool.label)}
        aria-keyshortcuts={tool.shortcut}
        aria-pressed={tool.id === activeId || (pressedIds ?? []).includes(tool.id)}
        disabled={disabled || paused?.includes(tool.id) || (!!only && tool.id !== only)}
        onClick={(e) => {
          // The click that ends a drag, or follows a finger tap already taken, does not press the tool again.
          if (rp.click({ id: tool.id, time: e.timeStamp, keyboard: e.detail === 0 })) onSelect(tool.id);
        }}
        {...(inTop && onReorder
          ? {
              onPointerDown: onPointerDown(tool.id),
              onPointerMove,
              onPointerUp,
              onPointerCancel,
              onKeyDown: onKeyDown(tool.id),
            }
          : {})}
      >
        <Icon name={tool.icon} size={21} />
      </button>
      <span className={styles.tip} data-rail-tooltip="" aria-hidden="true">
        {t(tool.label)}
        {tool.shortcut !== undefined && <kbd className={styles.key}>{tool.shortcut}</kbd>}
      </span>
    </div>
  );
  const more =
    moreTools.length === 0 ? null : (
      <div className={styles.slot} ref={moreRef} key={MORE_TOOLS_ID}>
        <button
          type="button"
          className={styles.tool}
          data-rail-tool={MORE_TOOLS_ID}
          aria-label={t('office.rail.more_tools')}
          aria-haspopup="true"
          aria-expanded={moreShown}
          aria-pressed={moreTools.some((x) => x.id === activeId || (pressedIds ?? []).includes(x.id))}
          disabled={disabled}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <Icon name="more_horiz" size={21} />
        </button>
        {moreShown ? (
          <div
            className={moreStyles.flyout}
            data-rail-more=""
            role="group"
            aria-label={t('office.rail.more_tools')}
          >
            {moreTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={moreStyles.item}
                data-rail-tool={tool.id}
                aria-keyshortcuts={tool.shortcut}
                aria-pressed={tool.id === activeId || (pressedIds ?? []).includes(tool.id)}
                disabled={disabled || paused?.includes(tool.id) || (!!only && tool.id !== only)}
                onClick={() => {
                  setMoreOpen(false);
                  onSelect(tool.id);
                }}
              >
                <Icon name={tool.icon} size={18} />
                <span>{t(tool.label)}</span>
                {tool.shortcut !== undefined && <kbd className={moreStyles.key}>{tool.shortcut}</kbd>}
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.tip} data-rail-tooltip="" aria-hidden="true">
            {t('office.rail.more_tools')}
          </span>
        )}
      </div>
    );
  return (
    <nav className={styles.rail} data-shell-region="rail" aria-label={t('office.shell.tools')}>
      <div className={`${styles.group} ${styles.top}`} data-rail="top" ref={topRef}>
        {shownTop.map((entry, i) =>
          entry.kind === 'separator' ? (
            <span
              key={i}
              className={styles.separator}
              data-rail="separator"
              role="separator"
              aria-orientation="horizontal"
            />
          ) : (
            renderTool(entry, true)
          ),
        )}
        {more}
      </div>
      <div className={styles.group} data-rail="bottom">
        {bottom.map((tool) => renderTool(tool, false))}
      </div>
    </nav>
  );
}
