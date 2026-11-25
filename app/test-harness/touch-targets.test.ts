// EZD-1936 (AC-EZD-1936-2): expectTouchTargets still measures the tap area with document.elementFromPoint in a
// real browser page. A 44 px target passes; a real 43 px target fails; a 44 px target with something drawn
// over it fails. Sizes: 11 Accessibility and input (44 px). The page is local HTML; no server is called.
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { expectTouchTargets } from './touch-targets';

const page = (body: string) =>
  `<!doctype html><html><body style="margin:0"><style>button{position:absolute;left:100px;top:100px;` +
  `box-sizing:border-box;margin:0;padding:0;border:0}</style><div id="root">${body}</div></body></html>`;

describe('EZD-1936 expectTouchTargets', () => {
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 400, height: 300 } });
  });

  afterAll(async () => {
    await browser.close();
  });

  const check = async (body: string) => {
    await tab.setContent(page(body));
    return expectTouchTargets(tab, tab.locator('#root'));
  };

  test('T1 a 44 x 44 px target passes and is counted', async () => {
    expect(await check('<button style="width:44px;height:44px">Go</button>')).toBe(1);
  });

  test('T2 a 43 px high target fails', async () => {
    await expect(check('<button style="width:44px;height:43px">Go</button>')).rejects.toThrow(
      /Go.{1,3} tap area 44x43/,
    );
  });

  test('T3 a 43 px wide target fails', async () => {
    await expect(check('<button style="width:43px;height:44px">Go</button>')).rejects.toThrow(
      /Go.{1,3} tap area 43x44/,
    );
  });

  test('T3b a 43 px target on a half pixel fails, a 44 px one passes', async () => {
    await expect(
      check('<button style="left:100.5px;top:100.5px;width:43px;height:43px">Go</button>'),
    ).rejects.toThrow(/Go.{1,3} tap area 43x43/);
    expect(
      await check('<button style="left:100.5px;top:100.5px;width:44px;height:44px">Go</button>'),
    ).toBe(1);
  });

  test('T4 a 44 px target with its lower edge covered fails (elementFromPoint)', async () => {
    // The cover hides the lowest 1 px row of the button (y 143), so 43 px can be tapped.
    const cover =
      '<div style="position:absolute;left:0;top:143px;width:400px;height:50px;background:#fff"></div>';
    await expect(
      check(`<button style="width:44px;height:44px">Go</button>${cover}`),
    ).rejects.toThrow(/Go.{1,3} tap area 44x43/);
  });

  test('T5 a 44 px target covered at its center fails (elementFromPoint)', async () => {
    const cover =
      '<div style="position:absolute;left:0;top:110px;width:400px;height:50px;background:#fff"></div>';
    await expect(
      check(`<button style="width:44px;height:44px">Go</button>${cover}`),
    ).rejects.toThrow(/Go.{1,3} covered at center 44x44/);
  });

  test('T6 two 44 px targets stacked with no gap both pass', async () => {
    expect(
      await check(
        '<button style="width:44px;height:44px">One</button>' +
          '<button style="top:144px;width:44px;height:44px">Two</button>',
      ),
    ).toBe(2);
  });

  test('T7 two 43 px targets stacked with no gap both fail', async () => {
    const run = check(
      '<button style="width:44px;height:43px">One</button>' +
        '<button style="top:143px;width:44px;height:43px">Two</button>',
    );
    await expect(run).rejects.toThrow(/One.{1,3} tap area 44x43/);
    await expect(run).rejects.toThrow(/Two.{1,3} tap area 44x43/);
  });

  test('T8 44 px targets in table cells that touch pass; 43 px ones fail', async () => {
    const table = (size: number) =>
      '<table style="border-collapse:collapse"><tr>' +
      ['A', 'B', 'C']
        .map(
          (n) =>
            `<td style="padding:0"><button style="position:static;display:block;width:${size}px;height:${size}px">${n}</button></td>`,
        )
        .join('') +
      '</tr></table>';
    expect(await check(table(44))).toBe(3);
    await expect(check(table(43))).rejects.toThrow(/B.{1,3} tap area 43x43/);
  });

  test('T9 a 44 px target cut to 43 px by a scroll box fails', async () => {
    await expect(
      check(
        '<div style="position:absolute;left:100px;top:100px;width:44px;height:43px;overflow:hidden">' +
          '<button style="position:static;display:block;width:44px;height:44px">Go</button></div>',
      ),
    ).rejects.toThrow(/Go.{1,3} tap area 44x43/);
  });

  test('T10 in the corners of the viewport a 44 px target passes and a 43 px one fails', async () => {
    await expect(
      check('<button style="left:0;top:0;width:43px;height:43px">Go</button>'),
    ).rejects.toThrow(/Go.{1,3} tap area 43x43/);
    await expect(
      check('<button style="left:357px;top:257px;width:43px;height:43px">Go</button>'),
    ).rejects.toThrow(/Go.{1,3} tap area 43x43/);
    expect(await check('<button style="left:0;top:0;width:44px;height:44px">Go</button>')).toBe(1);
    expect(
      await check('<button style="left:356px;top:256px;width:44px;height:44px">Go</button>'),
    ).toBe(1);
  });

  test('T11 a 30 px button with a 44 px hit area passes; with a 43 px one it fails', async () => {
    const withArea = (grow: number) =>
      `<style>#b::after{content:"";position:absolute;inset:-${grow}px}</style>` +
      '<button id="b" style="width:30px;height:30px">Go</button>';
    expect(await check(withArea(7))).toBe(1);
    await expect(check(withArea(6.5))).rejects.toThrow(/Go.{1,3} tap area 43x43/);
  });
});
