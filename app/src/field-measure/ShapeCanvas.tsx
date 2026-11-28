'use client';
// EZD-1415 (S17b "shape canvas with lettered walls"; Wall letter (tap) "Selects that wall; Selected wall cobalt";
// Walls mode "Tap to add corners; each new wall is lettered; tap the first corner to close; Angles snap to 90°
// unless held"). Each wall letter is a button named "Wall A" with a 44 px target; tapping the wall line selects it
// too. In Walls mode a tap on the canvas adds a corner; a press held for HOLD_MS or longer places it without the
// snap (vault/build/assumptions.md EZD-1415).
// EZD-1416 (S17b Auto-fill wall "Shown grey until computed"): the auto-filled wall's length is grey (data-auto) and
// the wall that will fill itself shows a grey dash until it is computed.
import { useRef, type PointerEvent } from 'react';
import { formatLength } from '@ezdraft/geometry';
import { spokenLength } from '../a11y/spoken-length';
import { useT } from '../lib/messages';
import { CANVAS_H, CANVAS_W, wallsOf, type Pt, type Wall } from './shapes';
import styles from './FieldMeasure.module.css';

export const HOLD_MS = 500;

// The view box leaves room around the outline for the wall letters.
const PAD = 30;
const VB = { x: -PAD, y: -PAD, w: CANVAS_W + 2 * PAD, h: CANVAS_H + 2 * PAD };
const LETTER_OFFSET = 16;

function signedArea(corners: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const p = corners[i] as Pt;
    const q = corners[(i + 1) % corners.length] as Pt;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Where a wall's letter sits: off the wall's middle, on the outside of the outline. */
function letterAt(wall: Wall, outward: 1 | -1): Pt {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (wall.start.x + wall.end.x) / 2 + (outward * dy * LETTER_OFFSET) / len,
    y: (wall.start.y + wall.end.y) / 2 - (outward * dx * LETTER_OFFSET) / len,
  };
}

const pct = (v: number, start: number, size: number) => `${((v - start) / size) * 100}%`;

export function ShapeCanvas({
  corners,
  closed,
  freeMode,
  lengths,
  auto = null,
  pending = null,
  selected,
  editable,
  onSelect,
  onTap,
}: {
  corners: readonly Pt[];
  closed: boolean;
  freeMode: boolean;
  lengths: readonly (number | null)[];
  /** The auto-filled wall (its length is worked out, not typed). */
  auto?: number | null;
  /** The wall that will fill itself once the others are typed. */
  pending?: number | null;
  selected: number | null;
  editable: boolean;
  onSelect: (index: number) => void;
  onTap: (p: Pt, held: boolean) => void;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const downAt = useRef<number | null>(null);
  const walls = wallsOf(corners, closed);
  const outward: 1 | -1 = signedArea(corners) >= 0 ? 1 : -1;
  const drawing = freeMode && !closed && editable;

  const onPointerDown = () => {
    downAt.current = Date.now();
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const started = downAt.current;
    downAt.current = null;
    // A tap on a drawn wall selects it (its click handler) and adds no corner.
    if (!drawing || svgRef.current === null) return;
    if (e.target instanceof Element && e.target.hasAttribute('data-hit')) return;
    const box = svgRef.current.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const p = {
      x: VB.x + ((e.clientX - box.left) / box.width) * VB.w,
      y: VB.y + ((e.clientY - box.top) / box.height) * VB.h,
    };
    onTap(p, started !== null && Date.now() - started >= HOLD_MS);
  };

  return (
    <div
      className={styles.canvas}
      data-testid="shape-canvas"
      data-walls={walls.length}
      data-closed={closed}
    >
      <svg
        ref={svgRef}
        className={styles.canvasSvg}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        aria-hidden="true"
        data-drawing={drawing}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {closed && corners.length >= 3 ? (
          <polygon className={styles.floor} points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />
        ) : null}
        {walls.map((w) => (
          <g key={w.index}>
            <line
              className={w.index === selected ? `${styles.wall} ${styles.wallOn}` : styles.wall}
              x1={w.start.x}
              y1={w.start.y}
              x2={w.end.x}
              y2={w.end.y}
            />
            <line
              className={styles.wallHit}
              data-hit=""
              x1={w.start.x}
              y1={w.start.y}
              x2={w.end.x}
              y2={w.end.y}
              onClick={() => onSelect(w.index)}
            />
            {lengths[w.index] != null || w.index === pending ? (
              <text
                className={
                  lengths[w.index] != null && w.index !== auto
                    ? styles.wallLength
                    : `${styles.wallLength} ${styles.wallLengthAuto}`
                }
                x={(w.start.x + w.end.x) / 2}
                y={(w.start.y + w.end.y) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                data-length={w.letter}
                data-auto={w.index === auto ? '' : undefined}
              >
                {lengths[w.index] != null ? formatLength(lengths[w.index] as number, 16) : '—'}
              </text>
            ) : null}
          </g>
        ))}
        {freeMode && !closed
          ? corners.map((c, i) => (
              <circle
                key={i}
                className={i === 0 ? styles.firstCorner : styles.corner}
                cx={c.x}
                cy={c.y}
                r={i === 0 ? 6 : 3}
              />
            ))
          : null}
      </svg>
      {walls.map((w) => {
        const at = letterAt(w, outward);
        return (
          <button
            key={w.index}
            type="button"
            className={w.index === selected ? `${styles.letter} ${styles.letterOn}` : styles.letter}
            style={{ left: pct(at.x, VB.x, VB.w), top: pct(at.y, VB.y, VB.h) }}
            // Audit 2026-11-27 A11: the drawing is hidden from screen readers, so the wall's length is in its name.
            aria-label={
              lengths[w.index] != null
                ? t('field.measure.wall_length', {
                    letter: w.letter,
                    length: spokenLength(lengths[w.index] as number, t),
                  })
                : t('field.measure.wall', { letter: w.letter })
            }
            aria-pressed={w.index === selected}
            data-wall={w.letter}
            onClick={() => onSelect(w.index)}
          >
            <span aria-hidden="true">{w.letter}</span>
          </button>
        );
      })}
    </div>
  );
}
