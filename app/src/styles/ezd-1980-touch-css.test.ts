// EZD-1980 (AC-EZD-1980-1, -3; audit/ui-live-2026-11-24/REPORT.md finding F8): every control the audit lists under
// "Touch targets" gets a 44 px size (var(--ez-touch-target), 11 Non-functional requirements "44 px minimum on touch")
// only inside `@media (any-pointer: coarse)`, written after its desktop rule, and the desktop rule keeps its size.
// The desktop values are the ones the boards' CSS already has (unchanged by this ticket).
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
  // Settings Defaults: 34 px inputs, 38 px search, 27 px segment buttons, chips (audit ipad-S15-settings-defaults).
  ['components/settings/defaults/DefaultsForm.module.css', '.input', 'height: 34px', [`height: ${T}`]],
  ['components/settings/defaults/DefaultsForm.module.css', '.searchInput', 'height: 38px', [`height: ${T}`]],
  ['components/settings/defaults/DefaultsForm.module.css', '.segment button', 'padding: 6px 10px', [`min-height: ${T}`, `min-width: ${T}`]],
  ['components/settings/defaults/DefaultsForm.module.css', '.chip', 'padding: 3px 9px', [`min-height: ${T}`, `min-width: ${T}`]],
  ['components/settings/defaults/DefaultsForm.module.css', '.row:has(> .control > .chips)', null, ['flex-wrap: wrap']],
  ['components/settings/defaults/ShortcutsTable.module.css', '.key', 'height: 28px', [`height: ${T}`]],
  ['components/settings/defaults/ShortcutsTable.module.css', '.filter button', 'padding: 5px 9px', [`min-height: ${T}`]],
  ['components/settings/defaults/ShortcutsTable.module.css', '.textButton', 'padding: 4px 6px', [`min-height: ${T}`]],
  // Libraries: 38 px tabs, 30 px chips, 18 px search (the box grows around a 44 px input), 40 px note rows.
  ['components/settings/libraries/Libraries.module.css', '.tab', 'padding: 8px 0 10px', [`min-height: ${T}`, `min-width: ${T}`]],
  ['components/settings/libraries/Libraries.module.css', '.row', 'padding: 10px 12px', [`min-height: ${T}`]],
  ['components/settings/libraries/Libraries.module.css', '.chip', 'height: 30px', [`height: ${T}`, `min-width: ${T}`]],
  ['components/settings/libraries/Libraries.module.css', '.search', 'height: 34px', ['height: auto']],
  ['components/settings/libraries/Libraries.module.css', '.searchInput', null, [`min-height: ${T}`]],
  // Sheet presets: 38 px fields, 32 px segments, 22 px name tokens.
  ['components/settings/sheet-presets/SheetPresets.module.css', '.input', 'height: 38px', [`height: ${T}`]],
  ['components/settings/sheet-presets/SheetPresets.module.css', '.segmentItem', 'height: 32px', [`height: ${T}`]],
  ['components/settings/sheet-presets/SheetPresets.module.css', '.token', 'padding: 2px 8px', [`min-height: ${T}`, `min-width: ${T}`]],
  ['components/settings/sheet-presets/SheetPresets.module.css', '.chipButton', 'padding: 5px 10px', [`min-height: ${T}`]],
  // Render models: 38 px selects, 18 px money inputs.
  ['components/settings/render-models/RenderModelsForm.module.css', '.select', 'height: 38px', [`height: ${T}`]],
  ['components/settings/render-models/RenderModelsForm.module.css', '.tableBox', 'overflow: hidden', ['flex: none']],
  ['components/settings/render-models/RenderModelsForm.module.css', '.moneyInput', 'height: 38px', ['height: auto']],
  ['components/settings/render-models/RenderModelsForm.module.css', '.moneyInput input', null, [`min-height: ${T}`]],
  // Company: 38 px fields, 32 px "0 archived", 18 px customer search.
  ['components/settings/company/CompanyForm.module.css', '.input', 'height: 38px', [`height: ${T}`]],
  ['components/settings/company/Customers.module.css', '.toggle', 'padding: 0', [`min-height: ${T}`, `min-width: ${T}`]],
  ['components/settings/company/Customers.module.css', '.search', 'height: 34px', ['height: auto']],
  ['components/settings/company/Customers.module.css', '.searchInput', null, [`min-height: ${T}`]],
  ['components/settings/company/CompanyForm.module.css', '.hint a', 'color: var(--ez-cobalt-link)', [`min-height: ${T}`]],
  // Title block: 34 x 20 switch, 16 px links, 30 px size buttons. Code edition: 38 px select, the same switch.
  ['components/settings/title-block/TitleBlockForm.module.css', '.switch', 'height: 20px', ['border: calc((var(--ez-touch-target) - 20px) / 2) solid transparent', 'background-clip: padding-box']],
  ['components/settings/title-block/TitleBlockForm.module.css', '.link', null, [`min-height: ${T}`]],
  ['components/settings/title-block/TitleBlockForm.module.css', '.segmentButton', 'height: 30px', [`height: ${T}`]],
  ['components/settings/code-edition/CodeEditionForm.module.css', '.select', 'height: 38px', [`height: ${T}`]],
  ['components/settings/code-edition/CodeEditionForm.module.css', '.switch', 'height: 20px', ['border: calc((var(--ez-touch-target) - 20px) / 2) solid transparent', 'background-clip: padding-box']],
  // EZD-614 Catalog appliance ratings: 30 px inputs, volts select, Add choice and 26 px remove buttons.
  ['components/settings/catalog/ApplianceRatings.module.css', '.nameInput', 'height: 30px', [`height: ${T}`]],
  ['components/settings/catalog/ApplianceRatings.module.css', '.numInput', 'height: 30px', [`height: ${T}`]],
  ['components/settings/catalog/ApplianceRatings.module.css', '.voltsSelect', 'height: 30px', [`height: ${T}`]],
  ['components/settings/catalog/ApplianceRatings.module.css', '.add', 'height: 30px', [`height: ${T}`]],
  ['components/settings/catalog/ApplianceRatings.module.css', '.remove', 'height: 26px', [`height: ${T}`, `width: ${T}`]],
  // Sheets: 32 px rows and set selector, 36 px Add sheet / property import, 32 x 32 Previous / Next.
  ['lazy/sheets-screen/SheetsScreen.module.css', '.row', 'min-height: 32px', [`min-height: ${T}`]],
  ['lazy/sheets-screen/SheetsScreen.module.css', '.setButton', 'min-height: 32px', [`min-height: ${T}`]],
  ['lazy/sheets-screen/SheetsScreen.module.css', '.add', 'min-height: 36px', [`min-height: ${T}`]],
  ['lazy/sheets-screen/SheetsScreen.module.css', '.navButton', 'width: 32px', [`width: ${T}`, `height: ${T}`]],
  // Cabinets tool: 28 x 28 TK / LR / CM, 36 px Line, 18 px search input.
  ['lazy/cabinet-run/CabinetLibrary.module.css', '.trim', 'min-height: 28px', [`min-height: ${T}`, `min-width: ${T}`]],
  ['lazy/cabinet-run/CabinetLibrary.module.css', '.line', 'min-height: 36px', [`min-height: ${T}`]],
  ['lazy/cabinet-run/CabinetLibrary.module.css', '.searchInput', null, [`min-height: ${T}`]],
  // Ceiling "Switching zones" (38 px) and New project "Paste page text or screenshot" (14 px).
  ['editor/ceiling/CeilingParts.module.css', '.lightingButton', 'padding: 9px 14px', [`min-height: ${T}`]],
  ['components/property-record/PropertyAppraiserLink.module.css', '.link', 'padding: 0', [`min-height: ${T}`]],
];

describe('EZD-1980 touch targets CSS', () => {
  it.each(CASES)('%s %s: 44 px only on a touch device, desktop rule unchanged', (file, sel, desktop, coarse) => {
    const rules = cssRules(read(file));
    const base = rules.filter((r) => r.media === null && r.sels.includes(sel));
    if (desktop !== null) {
      expect(base.length, `${sel} desktop rule`).toBeGreaterThan(0);
      expect(base.flatMap((r) => r.decls)).toContain(desktop);
      // No desktop rule of this selector takes the 44 px size.
      for (const r of base) for (const d of coarse) expect(r.decls).not.toContain(d);
    }
    const touch = rules.filter((r) => r.media === COARSE && r.sels.includes(sel));
    expect(touch.length, `${sel} coarse rule`).toBeGreaterThan(0);
    const decls = touch.flatMap((r) => r.decls);
    for (const d of coarse) expect(decls).toContain(d);
    const lastBase = Math.max(-1, ...base.map((r) => r.at));
    expect(Math.min(...touch.map((r) => r.at))).toBeGreaterThan(lastBase);
  });

  it('the new rules use the token, never a literal 44px', () => {
    for (const file of new Set(CASES.map((c) => c[0]))) {
      const coarse = cssRules(read(file)).filter((r) => r.media === COARSE);
      for (const r of coarse) for (const d of r.decls) expect(d, `${file} ${r.sels.join(', ')}`).not.toContain('44px');
    }
  });
});
