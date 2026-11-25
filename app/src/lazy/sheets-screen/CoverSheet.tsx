// EZD-728 (AC-EZD-728-1; phase-07 EZD-728; board S13Sheets box style): the cover sheet's blocks (cover-sheet.ts
// layout) inside the sheet preview's SVG, in paper inches. React escapes every text. The symbol key is drawn by
// SheetsCanvas as on every sheet; this draws the project block, scope of work, sheet index and notes.
import type { ReactElement } from 'react';
import { COVER_NAME_PT, COVER_LINE_IN, COVER_TEXT_PT, COVER_TITLE_PT, type CoverBlock, type CoverLayout } from './cover-sheet';
import { KEY_HEAD_IN, KEY_PAD_IN } from './SymbolKey';
import styles from './SheetsScreen.module.css';

const PT = 1 / 72;

function Block({ b }: { b: CoverBlock }): ReactElement {
  return (
    <g data-testid={`cover-${b.id}`}>
      {b.title !== null ? (
        <>
          <rect x={b.x} y={b.y} width={b.width} height={b.height} className={styles.keyBox} />
          <line x1={b.x} y1={b.y + KEY_HEAD_IN} x2={b.x + b.width} y2={b.y + KEY_HEAD_IN} className={styles.keyRule} />
          <text
            x={b.x + KEY_PAD_IN}
            y={b.y + KEY_HEAD_IN / 2}
            fontSize={COVER_TITLE_PT * PT}
            dominantBaseline="central"
            className={styles.keyTitle}
          >
            {b.title}
          </text>
        </>
      ) : null}
      {b.rows.map((r, i) => (
        <g key={i} data-testid={`cover-${b.id}-row`} data-lead={r.lead ?? undefined}>
          {r.lead !== null ? (
            <text x={b.leadX} y={r.y} fontSize={COVER_TEXT_PT * PT} dominantBaseline="central" className={styles.keyText}>
              {r.lead}
            </text>
          ) : null}
          {r.lines.map((line, j) => (
            <text
              key={j}
              x={b.textX}
              y={r.y + j * COVER_LINE_IN}
              fontSize={COVER_TEXT_PT * PT}
              dominantBaseline="central"
              className={styles.keyText}
            >
              {line}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
}

export function CoverSheet({ layout }: { layout: CoverLayout }): ReactElement {
  return (
    <g data-testid="cover-sheet">
      {layout.name !== null ? (
        <text x={layout.name.x} y={layout.name.y} fontSize={COVER_NAME_PT * PT} className={styles.coverName}>
          {layout.name.text}
        </text>
      ) : null}
      {layout.blocks.map((b) => (
        <Block key={b.id} b={b} />
      ))}
    </g>
  );
}
