// EZD-706 (board S13Sheets "SYMBOL KEY" box at the top of the notes column, "SYMBOLS USED ON THIS SHEET" on its title
// line, one row per symbol: its mark, then its label; S13 Validation "Text and symbols print at fixed paper size at
// any scale"; AC-EZD-706-1): the sheet's symbol key in paper inches, inside the sheet preview's SVG. Text sizes follow
// 09h: labels at the 3/32" note size, the title one size up (vault/build/assumptions.md EZD-702b, EZD-706).
import type { ReactElement } from 'react';
import type { SymbolGlyph, SystemSymbol } from '@ezdraft/geometry';
import { SYMBOL_KEY_TITLE, symbolKeyHeading, type SheetKey } from './sheet-key';
import styles from './SheetsScreen.module.css';

const PT = 1 / 72;
export const KEY_TITLE_PT = 9;
export const KEY_LABEL_PT = 6.75;
export const KEY_PAD_IN = 0.15;
export const KEY_HEAD_IN = 0.4;
export const KEY_ROW_IN = 0.3;
const SWATCH_W = 0.5;
const SWATCH_H = 0.2;

// The key's height for n rows, paper inches.
export function symbolKeyHeight(rows: number): number {
  return KEY_HEAD_IN + rows * KEY_ROW_IN + KEY_PAD_IN;
}

function Mark({ glyph, x, y }: { glyph: SymbolGlyph; x: number; y: number }): ReactElement {
  // (x, y) is the swatch's top-left corner; cx, cy its centre.
  const cx = x + SWATCH_W / 2;
  const cy = y + SWATCH_H / 2;
  const r = SWATCH_H / 2;
  const box = <rect x={x} y={y} width={SWATCH_W} height={SWATCH_H} />;
  switch (glyph.kind) {
    case 'wall':
      return (
        <rect
          x={x}
          y={y + SWATCH_H * 0.2}
          width={SWATCH_W}
          height={SWATCH_H * 0.6}
          className={glyph.status === 'demo' ? styles.keyDemo : styles.keyPoche}
        />
      );
    case 'door':
      return (
        <g>
          <line x1={x + 0.1} y1={y + SWATCH_H} x2={x + 0.1} y2={y} />
          <path d={`M ${x + 0.1} ${y} A ${SWATCH_H} ${SWATCH_H} 0 0 1 ${x + 0.1 + SWATCH_H} ${y + SWATCH_H}`} />
        </g>
      );
    case 'window':
      return (
        <g>
          {box}
          <line x1={x} y1={cy} x2={x + SWATCH_W} y2={cy} />
        </g>
      );
    case 'outline':
      return box;
    case 'register':
      return (
        <g>
          {box}
          <line x1={x} y1={y} x2={x + SWATCH_W} y2={y + SWATCH_H} />
          {glyph.diagonals === 2 ? <line x1={x} y1={y + SWATCH_H} x2={x + SWATCH_W} y2={y} /> : null}
        </g>
      );
    case 'hatch':
      return (
        <g>
          {box}
          {[0.1, 0.2, 0.3, 0.4].map((d) => (
            <line key={d} x1={x + d} y1={y + SWATCH_H} x2={x + d + 0.1} y2={y} />
          ))}
        </g>
      );
    case 'circle':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} />
          {glyph.text !== null ? (
            <text x={cx} y={cy} fontSize={4 * PT} textAnchor="middle" dominantBaseline="central" className={styles.keyText}>
              {glyph.text}
            </text>
          ) : null}
        </g>
      );
    case 'duplex':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} />
          <line x1={cx - r * 0.4} y1={cy - r * 0.6} x2={cx - r * 0.4} y2={cy + r * 0.6} />
          <line x1={cx + r * 0.4} y1={cy - r * 0.6} x2={cx + r * 0.4} y2={cy + r * 0.6} />
        </g>
      );
    case 'fan':
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} />
          {[90, 210, 330].map((deg) => (
            <line
              key={deg}
              x1={cx}
              y1={cy}
              x2={cx + r * Math.cos((deg * Math.PI) / 180)}
              y2={cy - r * Math.sin((deg * Math.PI) / 180)}
            />
          ))}
        </g>
      );
    case 'triplex':
      // EZD-2043 (Q-0920): the 240 V utility point, a circle with 3 short parallel lines and its tag beside it.
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} />
          {[-0.4, 0, 0.4].map((d) => (
            <line key={d} x1={cx + r * d} y1={cy - r * 0.6} x2={cx + r * d} y2={cy + r * 0.6} />
          ))}
          <text x={cx + r * 1.2} y={cy} fontSize={4 * PT} dominantBaseline="central" className={styles.keyText}>
            {glyph.tag}
          </text>
        </g>
      );
    case 'keynote':
      return <rect x={cx - r} y={y} width={SWATCH_H} height={SWATCH_H} />;
    case 'delta':
      return <path d={`M ${cx} ${y} L ${cx + r} ${y + SWATCH_H} L ${cx - r} ${y + SWATCH_H} Z`} />;
  }
}

export function SymbolKey({
  sheetKey,
  x,
  y,
  width,
}: {
  sheetKey: SheetKey;
  x: number;
  y: number;
  width: number;
}): ReactElement {
  const rows: readonly SystemSymbol[] = sheetKey.symbols;
  const titleY = y + KEY_HEAD_IN / 2;
  return (
    <g data-testid="symbol-key" data-scope={sheetKey.scope}>
      <rect x={x} y={y} width={width} height={symbolKeyHeight(rows.length)} className={styles.keyBox} />
      <line x1={x} y1={y + KEY_HEAD_IN} x2={x + width} y2={y + KEY_HEAD_IN} className={styles.keyRule} />
      <text x={x + KEY_PAD_IN} y={titleY} fontSize={KEY_TITLE_PT * PT} dominantBaseline="central" className={styles.keyTitle}>
        {SYMBOL_KEY_TITLE}
      </text>
      <text
        x={x + width - KEY_PAD_IN}
        y={titleY}
        fontSize={KEY_LABEL_PT * 0.75 * PT}
        textAnchor="end"
        dominantBaseline="central"
        className={styles.keyText}
      >
        {symbolKeyHeading(sheetKey.scope)}
      </text>
      {rows.map((s, i) => {
        const top = y + KEY_HEAD_IN + i * KEY_ROW_IN + (KEY_ROW_IN - SWATCH_H) / 2;
        return (
          <g key={s.id} data-testid="symbol-key-row" data-symbol={s.id} className={styles.keyMark}>
            <Mark glyph={s.glyph} x={x + KEY_PAD_IN} y={top} />
            <text
              x={x + KEY_PAD_IN + SWATCH_W + KEY_PAD_IN}
              y={top + SWATCH_H / 2}
              fontSize={KEY_LABEL_PT * PT}
              dominantBaseline="central"
              className={styles.keyText}
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
