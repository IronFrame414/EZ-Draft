// EZD-014c section 3 (vault/plans/EZD-014c.md): the 44 px touch-target check, reused by EZD-015 and EZD-1708.
// 11 Accessibility and input (44 px). No import.meta, no __dirname (lesson L-017).
import { expect, type Locator, type Page } from '@playwright/test';

export const TOUCH_TARGET_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';

export async function expectTouchTargets(page: Page, root: Locator): Promise<number> {
  void page;
  const result = await root.evaluate((rootEl, selector) => {
    const failures: string[] = [];
    let checked = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hitAt = (el: Element, x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      const found = document.elementFromPoint(x, y);
      return found !== null && el.contains(found);
    };
    const reach = (el: Element, cx: number, cy: number, dx: number, dy: number): number => {
      let k = 0;
      for (let i = 1; i <= 100; i++) {
        if (!hitAt(el, cx + dx * i, cy + dy * i)) break;
        k = i;
      }
      return k;
    };
    for (const el of Array.from(rootEl.querySelectorAll(selector))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) {
        continue;
      }
      checked++;
      const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 20);
      const label = (reason: string, hh: number, vv: number): string =>
        `${el.tagName} "${name}" ${reason} ${hh}x${vv}`;
      if (r.left < 0 || r.top < 0 || r.right > w || r.bottom > h) {
        failures.push(label('outside viewport', Math.round(r.width), Math.round(r.height)));
        continue;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (!hitAt(el, cx, cy)) {
        failures.push(label('covered at center', Math.round(r.width), Math.round(r.height)));
        continue;
      }
      const left = reach(el, cx, cy, -1, 0);
      const right = reach(el, cx, cy, 1, 0);
      const up = reach(el, cx, cy, 0, -1);
      const down = reach(el, cx, cy, 0, 1);
      const hh = left + right + 1;
      const vv = up + down + 1;
      if (hh < 44 || vv < 44) failures.push(label('tap area', hh, vv));
    }
    return { failures, checked };
  }, TOUCH_TARGET_SELECTOR);
  expect(result.failures, 'touch targets').toEqual([]);
  return result.checked;
}
