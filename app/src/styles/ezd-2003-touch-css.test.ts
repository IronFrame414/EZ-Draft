// EZD-2003 (AC-EZD-2003-1, AC-EZD-2003-3; vault/plans/audit-a11y-ipad-2026-11-27.md A22 to A26): every control the audit lists
// (and the other controls on the same screens) gets a 44 px size (var(--ez-touch-target), 11 Non-functional
// requirements "44 px minimum on touch") only inside `@media (any-pointer: coarse)`, written after its desktop rule,
// and the desktop rule keeps its size. The desktop values are the ones the CSS already has (unchanged by this
// ticket); the audit's sizes are in the comments. The parser is a copy of ezd-1980-touch-css.test.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(src, rel), 'utf8');

type Rule = { media: string | null; sels: string[]; decls: string[]; at: number };

function cssRules(text: string): Rule[] {
  const s = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'");
  const out: Rule[] = [];
  const stack: { prelude: string; isMedia: boolean }[] = [];
  let buf = '';
  for (const ch of s) {
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      stack.push({ prelude, isMedia: prelude.startsWith('@media') });
      continue;
    }
    if (ch === '}') {
      const top = stack.pop();
      if (top && !top.isMedia) {
        out.push({
          media: stack.find((x) => x.isMedia)?.prelude ?? null,
          sels: top.prelude.split(',').map((x) => x.trim()),
          decls: buf
            .split(';')
            .map((d) => d.trim())
            .filter((d) => d.length > 0),
          at: out.length,
        });
      }
      buf = '';
      continue;
    }
    buf += ch;
  }
  return out;
}

const COARSE = '@media (any-pointer: coarse)';
const T = 'var(--ez-touch-target)';

// [file, selector, desktop declaration kept outside any media block (null: none to keep), coarse declarations]
const CASES: Array<[string, string, string | null, string[]]> = [
  // A22 Cabinets: box inspector (30 px segments, 36 px fields, 40 px footer, about 20 px ×).
  ['lazy/cabinet-run/BoxInspector.module.css', '.segment', 'height: 30px', [`height: ${T}`]],
  ['lazy/cabinet-run/BoxInspector.module.css', '.input', 'padding: 9px 10px', [`min-height: ${T}`]],
  ['lazy/cabinet-run/BoxInspector.module.css', '.select', 'padding: 9px 10px', [`height: ${T}`]],
  ['lazy/cabinet-run/BoxInspector.module.css', '.pillSelect', 'appearance: none', [`height: ${T}`]],
  [
    'lazy/cabinet-run/BoxInspector.module.css',
    '.inlineSelect',
    'font: 400 var(--ez-text-14) var(--ez-font-sans)',
    [`height: ${T}`],
  ],
  [
    'lazy/cabinet-run/BoxInspector.module.css',
    '.linkValue',
    'padding: 0',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  [
    'lazy/cabinet-run/BoxInspector.module.css',
    '.swapItem',
    'padding: 8px 10px',
    [`min-height: ${T}`],
  ],
  ['lazy/cabinet-run/BoxInspector.module.css', '.footerButton', 'height: 40px', [`height: ${T}`]],
  [
    'lazy/cabinet-run/BoxInspector.module.css',
    '.close',
    'font-size: var(--ez-text-18)',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  // Run inspector: 40 px Schedule, × close.
  ['lazy/cabinet-run/RunInspector.module.css', '.footerButton', 'height: 40px', [`height: ${T}`]],
  [
    'lazy/cabinet-run/RunInspector.module.css',
    '.close',
    'font-size: var(--ez-text-18)',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  // Run screen: header, 32 px menu rows, typed width, tile bar and Auto-fill bar; the screen starts below the edit bar.
  [
    'lazy/cabinet-run/CabinetRunView.module.css',
    '.screen',
    'padding: 16px 24px',
    ['padding-top: 92px'],
  ],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.name', 'padding: 2px 6px', [`min-height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.picker select', null, [`height: ${T}`]],
  [
    'lazy/cabinet-run/CabinetRunView.module.css',
    'button.fitChip',
    'cursor: pointer',
    [`min-height: ${T}`],
  ],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.autoFill', 'height: 36px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.entryInput', 'height: 32px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.menuItem', 'height: 32px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.tileInput', 'height: 32px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.tileSelect', 'height: 32px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.tileButton', 'height: 32px', [`height: ${T}`]],
  ['lazy/cabinet-run/CabinetRunView.module.css', '.fillConfirm', 'height: 32px', [`height: ${T}`]],
  // Cabinet schedule: × close, 40 px Export.
  [
    'lazy/cabinet-run/CabinetSchedule.module.css',
    '.close',
    'font-size: var(--ez-text-18)',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  ['lazy/cabinet-run/CabinetSchedule.module.css', '.export', 'height: 40px', [`height: ${T}`]],
  // A23 Countertops: piece inspector (32 px inputs and select, 28 px chips, the canvas pill).
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.input',
    'height: 32px',
    [`height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.inputOn',
    'height: 32px',
    [`height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.edgeSelect',
    'height: 32px',
    [`height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.chip',
    'height: 28px',
    [`height: ${T}`, `min-width: ${T}`],
  ],
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.pill',
    'padding: 8px 14px',
    [`min-height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopPieceInspector.module.css',
    '.pillOpen',
    'padding: 8px 14px',
    [`min-height: ${T}`],
  ],
  // Left panel: 36 px Pick, fields and selects; the Settings link.
  [
    'lazy/countertops/CountertopsPanel.module.css',
    '.pick',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopsPanel.module.css',
    '.input',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopsPanel.module.css',
    '.kv select',
    'min-height: 36px',
    [`height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopsPanel.module.css',
    '.link',
    'padding-top: 6px',
    [`min-height: ${T}`],
  ],
  // Countertop screen: 36 px typed length, cutout sizes and kinds; the screen starts below the edit bar.
  [
    'lazy/countertops/CountertopsView.module.css',
    '.screen',
    'padding: 16px 24px',
    ['padding-top: 92px'],
  ],
  [
    'lazy/countertops/CountertopsView.module.css',
    '.length input',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopsView.module.css',
    '.cutoutForm input',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  [
    'lazy/countertops/CountertopsView.module.css',
    '.kind',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  // Edit offered edges: 40 px footer, Cancel / Save, 32 px rates, ×, and the tick box (its label is the tap area).
  [
    'lazy/countertops/EditOfferedEdges.module.css',
    '.footerButton',
    'height: 40px',
    [`height: ${T}`],
  ],
  ['lazy/countertops/EditOfferedEdges.module.css', '.rate', 'height: 32px', [`height: ${T}`]],
  ['lazy/countertops/EditOfferedEdges.module.css', '.rateBad', 'height: 32px', [`height: ${T}`]],
  ['lazy/countertops/EditOfferedEdges.module.css', '.cancel', 'height: 40px', [`height: ${T}`]],
  ['lazy/countertops/EditOfferedEdges.module.css', '.save', 'height: 40px', [`height: ${T}`]],
  [
    'lazy/countertops/EditOfferedEdges.module.css',
    '.close',
    'font-size: var(--ez-text-18)',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  [
    'lazy/countertops/EditOfferedEdges.module.css',
    '.tick',
    'cursor: pointer',
    ['position: relative', `min-height: ${T}`],
  ],
  [
    'lazy/countertops/EditOfferedEdges.module.css',
    '.tickInput',
    null,
    ['position: absolute', 'inset: 0', 'opacity: 0'],
  ],
  [
    'lazy/countertops/EditOfferedEdges.module.css',
    '.check',
    'display: none',
    ['display: inline-flex'],
  ],
  // Top schedule: 40 px footer and Export, ×.
  ['lazy/countertops/TopSchedule.module.css', '.footerButton', 'height: 40px', [`height: ${T}`]],
  ['lazy/countertops/TopSchedule.module.css', '.export', 'height: 40px', [`height: ${T}`]],
  [
    'lazy/countertops/TopSchedule.module.css',
    '.close',
    'font-size: var(--ez-text-18)',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  // A24 Import review: 36 px rows, 32 px modes, about 22 px group Accept, 40 px typed length box.
  [
    'editor/import-review/ImportReview.module.css',
    '.row',
    'min-height: 36px',
    [`min-height: ${T}`],
  ],
  [
    'editor/import-review/ImportReview.module.css',
    '.mode',
    'min-height: 32px',
    [`min-height: ${T}`],
  ],
  [
    'editor/import-review/ImportReview.module.css',
    '.groupAccept',
    'padding: 2px 8px',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  [
    'editor/import-review/ImportReview.module.css',
    '.typedInput',
    'min-height: 40px',
    [`min-height: ${T}`],
  ],
  // A25 Edit menu: about 30 px rows; the save-group dialog's 30 px box and buttons.
  ['lazy/edit-menu/EditMenu.module.css', '.item', 'padding: 6px 10px', [`min-height: ${T}`]],
  ['lazy/edit-menu/EditMenu.module.css', '.input', 'padding: 6px 8px', [`min-height: ${T}`]],
  ['lazy/edit-menu/EditMenu.module.css', '.button', 'padding: 6px 12px', [`min-height: ${T}`]],
  ['lazy/edit-menu/EditMenu.module.css', '.primary', 'padding: 6px 12px', [`min-height: ${T}`]],
  // A26 small editor controls.
  ['components/shell/RailMore.module.css', '.item', 'height: 36px', [`height: ${T}`]],
  ['components/shell/ReviewList.module.css', '.row', 'min-height: 36px', [`min-height: ${T}`]],
  ['components/shell/ReviewList.module.css', '.retry', 'padding: 4px 10px', [`min-height: ${T}`]],
  ['components/shell/ReviewList.module.css', 'a.label', null, [`min-height: ${T}`]],
  [
    'editor/help/HelpPanel.module.css',
    '.close',
    'padding: 4px',
    [`min-height: ${T}`, `min-width: ${T}`],
  ],
  ['editor/edit/InspectorMore.module.css', '.button', 'padding: 4px 10px', [`min-height: ${T}`]],
  ['editor/inspector/PinPanel.module.css', '.button', 'padding: 4px 10px', [`min-height: ${T}`]],
  ['editor/tools/BeamSpacingPill.module.css', '.pill', 'height: 26px', [`height: ${T}`]],
  ['editor/tools/BeamSpacingPill.module.css', '.input', 'height: 26px', [`height: ${T}`]],
  [
    'components/catalog/CatalogPicker.module.css',
    '.category',
    'min-height: 34px',
    [`min-height: ${T}`],
  ],
];

describe('EZD-2003 touch targets CSS', () => {
  it.each(CASES)(
    '%s %s: 44 px only on a touch device, desktop rule unchanged',
    (file, sel, desktop, coarse) => {
      const rules = cssRules(read(file));
      const base = rules.filter((r) => r.media === null && r.sels.includes(sel));
      if (desktop !== null) {
        expect(base.length, `${sel} desktop rule`).toBeGreaterThan(0);
        expect(base.flatMap((r) => r.decls)).toContain(desktop);
        // No desktop rule of this selector takes the touch size.
        for (const r of base) for (const d of coarse) expect(r.decls).not.toContain(d);
      }
      const touch = rules.filter((r) => r.media === COARSE && r.sels.includes(sel));
      expect(touch.length, `${sel} coarse rule`).toBeGreaterThan(0);
      const decls = touch.flatMap((r) => r.decls);
      for (const d of coarse) expect(decls).toContain(d);
      const lastBase = Math.max(-1, ...base.map((r) => r.at));
      expect(Math.min(...touch.map((r) => r.at))).toBeGreaterThan(lastBase);
    },
  );

  it('the new rules use the token, never a literal 44px', () => {
    for (const file of new Set(CASES.map((c) => c[0]))) {
      const coarse = cssRules(read(file)).filter((r) => r.media === COARSE);
      for (const r of coarse)
        for (const d of r.decls) expect(d, `${file} ${r.sels.join(', ')}`).not.toContain('44px');
    }
  });
});
