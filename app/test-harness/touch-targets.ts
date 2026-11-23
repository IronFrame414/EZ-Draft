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
    // EZD-1936: Chromium's elementFromPoint tests a 1 px box that starts at the point, so a point up to 1 px
    // left of or above an element still finds it. Counting whole steps from the center, a real 43 px target
    // then measured 44 whenever its center fell on a half pixel. The length is therefore measured to the edge:
    // from the first to the last point that finds the element along the line, to 1/64 px (the browser's layout
    // step). A 43 px target gives at most 43 63/64; a 44 px one gives 44 or more, also when its neighbors touch
    // it.
    const STEP = 1 / 64;
    // The farthest distance from the center, in direction (dx, dy), at which the point still finds the
    // element; 100 when it does so for the whole 100 px walked (the cap of this check, as before).
    const edge = (el: Element, cx: number, cy: number, dx: number, dy: number): number => {
      let k = 0;
      while (k < 100 && hitAt(el, cx + dx * (k + 1), cy + dy * (k + 1))) k++;
      if (k === 100) return k;
      let lo = 0;
      let hi = 64;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (hitAt(el, cx + dx * (k + mid * STEP), cy + dy * (k + mid * STEP))) lo = mid;
        else hi = mid;
      }
      return k + lo * STEP;
    };
    // The tappable length through the center along one axis, in whole px (at most 201).
    const extent = (el: Element, cx: number, cy: number, ax: number, ay: number): number => {
      const c = ax === 1 ? cx : cy;
      const size = ax === 1 ? w : h;
      const before = edge(el, cx, cy, -ax, -ay);
      const after = edge(el, cx, cy, ax, ay);
      let length = before + after + STEP;
      // At the start of the viewport there is no point 1 px before the element to find it from, and
      // elementFromPoint finds nothing in the viewport's last half pixel (it rounds the point). A run that the
      // viewport ends is counted as it would be anywhere else on the page.
      if (before < 100 && c - before - STEP < 0) length += 1 - STEP;
      if (after < 100 && Math.round(c + after + STEP) >= size) length += size - (c + after + STEP);
      return Math.min(201, Math.floor(length + STEP / 2));
    };
    for (const el of Array.from(rootEl.querySelectorAll(selector))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) {
        continue;
      }
      checked++;
      const name = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 20);
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
      const hh = extent(el, cx, cy, 1, 0);
      const vv = extent(el, cx, cy, 0, 1);
      if (hh < 44 || vv < 44) failures.push(label('tap area', hh, vv));
    }
    return { failures, checked };
  }, TOUCH_TARGET_SELECTOR);
  expect(result.failures, 'touch targets').toEqual([]);
  return result.checked;
}
