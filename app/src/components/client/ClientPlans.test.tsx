// EZD-2032 AC-EZD-2032-2 (S18 Page tab: Plans; wording "Preparing sheets…" and "Plans", approved Q-0803 on the S18
// rows of vault/build/assumptions/EZD-1202.md): the Plans tab's server render in each state, the zoom about a point
// that pinch and wheel use, and the read of /api/c/<token>/sheets. Tapping, pinching and panning in a real browser:
// app/e2e/client-plans.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ClientPlans, FIT, MAX_ZOOM, fetchClientSheets, zoomAbout } from './ClientPlans';
import type { ClientPlansView } from './client-page-model';

const render = (initial?: ClientPlansView) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('client', 'en')}>
      <ClientPlans token="t" initial={initial} />
    </MessagesProvider>,
  );

const sheet = (number: string, title: string) => ({
  number,
  title,
  src: `https://storage.test/${number}.webp?token=x`,
  width: 2400,
  height: 1600,
  thumb: { src: `https://storage.test/${number}-thumb.webp?token=x`, width: 400, height: 267 },
});

describe('EZD-2032 client Plans tab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Loading… while the tab is read', () => {
    expect(render()).toContain('Loading…');
  });

  it('AC-EZD-2032-2 shows "Preparing sheets…" until the images exist', () => {
    const html = render({ state: 'preparing' });
    expect(html).toContain('Preparing sheets…');
    expect(html).not.toContain('<img');
  });

  it('AC-EZD-2032-2 lists the sheets in set order, each a thumbnail with its number and title', () => {
    const html = render({
      state: 'ready',
      sheets: [sheet('A0.0', 'Cover'), sheet('A1.0', 'Existing'), sheet('A2.0', 'Demo')],
    });
    const order = ['A0.0', 'A1.0', 'A2.0'].map((n) => html.indexOf(`aria-label="Open sheet ${n}`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('src="https://storage.test/A1.0-thumb.webp?token=x"');
    expect(html).toContain('width="400"');
    expect(html).toContain('Existing');
    // The full image loads only when a sheet is opened.
    expect(html).not.toContain('A1.0.webp');
  });

  it('pinch and wheel zoom keep the point under the fingers still, from fit (1) to 8x', () => {
    const at = { x: 100, y: 50 };
    const z = zoomAbout(FIT, 2, at);
    expect(z).toEqual({ scale: 2, x: -100, y: -50 });
    // The image point under `at` stays under it: (at - offset) / scale is the same before and after.
    expect((at.x - z.x) / z.scale).toBe(at.x);
    expect(zoomAbout(z, 100, at).scale).toBe(MAX_ZOOM);
    expect(zoomAbout(z, 0.1, at)).toEqual(FIT);
  });

  it('reads the tab from /api/c/<token>/sheets without credentials, and a failed read is null', async () => {
    const fetchMock = vi.fn(async () => Response.json({ plans: { state: 'preparing' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchClientSheets('tok')).toEqual({ state: 'preparing' });
    expect(fetchMock).toHaveBeenCalledWith('/api/c/tok/sheets', { cache: 'no-store', credentials: 'omit' });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: {} }, { status: 404 })));
    expect(await fetchClientSheets('tok')).toBeNull();
  });
});
