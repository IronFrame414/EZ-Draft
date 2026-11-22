'use client';
// EZD-702a (S13 Layout "Canvas: sheet label and position; prev/next + zoom; sheet preview; thumbnail strip at
// bottom"; S13 Controls "Previous / Next sheet", "Sheet canvas", "Thumbnail"; board S13Sheets; AC-EZD-702a-1): the open
// sheet at its set's paper size with the draft watermark, and a strip with one thumbnail per sheet that opens it
// (active outlined, open items in amber). The sheet's drawing and the thumbnail images come with the sheet renderer
// (EZD-702b); until then the page shows its frame and title block number only.
// EZD-702b (AC-EZD-702b-1): a plan sheet's drawing is the sheet renderer's SVG markup (paper inches, the same
// viewBox), drawn inside the page once the worker answers. The markup is built by sheetSvg, which escapes every text.
import { useEffect, useRef, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import {
  draftRevision,
  draftWatermark,
  neighbourSheet,
  paperInches,
  sheetFrame,
  sheetPosition,
  type Sheet,
} from '../../lib/sheets/sheet-set';
import type { SheetSize } from '@ezdraft/geometry';
import { sheetMarks } from './sheet-labels';
import type { SheetsScreen } from './sheets-screen-store';
import { useSheetsScreen } from './use-sheets-screen';
import styles from './SheetsScreen.module.css';

export type SheetsCanvasProps = { screen: SheetsScreen };

// CSS pixels per printed inch: a zoom of 100% shows the sheet at its printed size.
const PX_PER_IN = 96;

export function zoomPercent(zoom: number | null): string {
  return zoom === null ? '' : `${Math.round(zoom * 100)}%`;
}

function SheetPage({
  sheet,
  size,
  watermark,
  drawing,
}: {
  sheet: Sheet;
  size: SheetSize;
  watermark: string | null;
  drawing: string | null;
}): ReactElement {
  const { width: w, height: h } = paperInches(size);
  // Board S13Sheets: a border inset from the paper edge and the title block column on the right with the number.
  const { margin: m, titleBlock: tb } = sheetFrame(size);
  return (
    <svg
      className={styles.page}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${sheet.number} ${sheet.title}`}
      data-testid="sheet-preview"
      data-sheet={sheet.number}
    >
      <rect x={0} y={0} width={w} height={h} className={styles.paper} />
      <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} className={styles.frame} />
      <line x1={w - m - tb} y1={m} x2={w - m - tb} y2={h - m} className={styles.frame} />
      {drawing !== null ? (
        <g data-testid="sheet-drawing" dangerouslySetInnerHTML={{ __html: drawing }} />
      ) : null}
      {watermark !== null ? (
        <text x={m * 2} y={m * 2.6} className={styles.watermark} fontSize={h / 90} data-testid="sheet-watermark">
          {watermark}
        </text>
      ) : null}
      <text
        x={w - m - tb / 2}
        y={h - m * 4}
        textAnchor="middle"
        className={styles.pageNumber}
        fontSize={h / 18}
      >
        {sheet.number}
      </text>
      <text x={w - m - tb / 2} y={h - m * 8} textAnchor="middle" className={styles.pageTitle} fontSize={h / 70}>
        {sheet.title.toUpperCase()}
      </text>
    </svg>
  );
}

export function SheetsCanvas({ screen }: SheetsCanvasProps): ReactElement {
  const t = useT();
  const state = useSheetsScreen(screen);
  const set = state.sets.find((s) => s.kind === state.kind) ?? null;
  const sheets = set?.sheets ?? [];
  const sheet = sheets.find((s) => s.number === state.open) ?? null;
  const pos = sheet === null ? null : sheetPosition(sheets, sheet.number);
  const prev = sheet === null ? null : neighbourSheet(sheets, sheet.number, -1);
  const next = sheet === null ? null : neighbourSheet(sheets, sheet.number, 1);
  const size = set?.size ?? null;

  // The preview fits its area; the zoom readout is the shown width over the printed width.
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (el === null || size === null || typeof ResizeObserver === 'undefined') return;
    const paper = paperInches(size);
    const measure = () => {
      const { clientWidth: cw, clientHeight: ch } = el;
      if (cw <= 0 || ch <= 0) return;
      const shown = Math.min(cw, (ch * paper.width) / paper.height);
      screen.setZoom(shown / (paper.width * PX_PER_IN));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen, size]);

  const watermark = set === null ? null : draftWatermark(draftRevision(set));

  return (
    <div className={styles.canvas} data-testid="sheets-canvas" data-sheet-renders={state.renders}>
      <div className={styles.bar}>
        <div className={styles.label} data-testid="sheets-label">
          {sheet !== null ? (
            <>
              <span className={styles.labelNumber}>{sheet.number}</span>
              <span className={styles.labelTitle}>{sheet.title}</span>
              {pos !== null ? (
                <span className={styles.labelPos} data-testid="sheets-position">
                  {t('office.sheets.position', { index: pos.index, of: pos.of })}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            aria-label={t('office.sheets.previous')}
            disabled={prev === null}
            data-testid="sheets-previous"
            onClick={() => prev !== null && screen.open(prev.number)}
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <span className={styles.zoom} data-testid="sheets-zoom">
            {zoomPercent(state.zoom)}
          </span>
          <button
            type="button"
            className={styles.navButton}
            aria-label={t('office.sheets.next')}
            disabled={next === null}
            data-testid="sheets-next"
            onClick={() => next !== null && screen.open(next.number)}
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      </div>
      <div className={styles.area} ref={areaRef}>
        {sheet !== null && size !== null ? (
          <SheetPage
            sheet={sheet}
            size={size}
            watermark={watermark}
            drawing={
              state.drawing !== null &&
              state.drawing.sheet === sheet.number &&
              state.drawing.size === size
                ? state.drawing.markup
                : null
            }
          />
        ) : null}
      </div>
      <nav className={styles.strip} aria-label={t('office.sheets.strip')} data-testid="sheets-strip">
        {sheets.map((s) => {
          const active = s.number === state.open;
          const amber = sheetMarks(s).openItems > 0;
          const cls = [styles.thumb, active ? styles.thumbOn : '', amber ? styles.thumbAmber : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={s.number}
              type="button"
              className={cls}
              aria-current={active ? 'page' : undefined}
              aria-label={`${s.number} ${s.title}`}
              data-testid={`sheet-thumb-${s.number}`}
              onClick={() => screen.open(s.number)}
            >
              <span className={styles.thumbPage} aria-hidden="true" />
              <span className={styles.thumbNumber}>{s.number}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
